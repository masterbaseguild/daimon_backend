import express from "express";
import cors from "cors";
import passport from "passport";
import { Strategy as localStrategy } from "passport-local";
import { Strategy as discordStrategy } from "passport-discord";
import bcrypt from "bcryptjs";
import session from "express-session";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import http from "http";
import mariadb from "mariadb";
import "dotenv/config";
import axios from "axios";

// data types

declare global {
    namespace Express {
        interface User {
            id: string;
        }
    }
    interface Body {
        gender: boolean;
        muscle: number;
        fat: number;
        height: number;
        eyeColor: string;
        hairColor: string;
        hairStyle: string;
    }
    type tableName = "players" | "guilds" | "messages" | "players_to_guilds" | "discord_users" | "minecraft_players" | "local_users" | "minecraft_factions" | "characters" | "cosmetics" | "feed";
}

// ids

const generateId = (table: tableName) => {
    return new Promise<string>((resolve) => {
        const id = crypto.randomBytes(6).toString("hex");
        checkId(id, table).then((result: boolean) => {
            if(result) generateId(table);
            else resolve(id);
        });
    });
};

const checkId = (id: string, table: tableName) => {
    return new Promise<boolean>((resolve) => {
        dbQueryOne(`SELECT * FROM ${table} WHERE id = ?`, [id])
            .then((row: any) => {
                if(row) resolve(true);
                else resolve(false);
            });
    });
};

// database

const database = mariadb.createPool({
    host: process.env.DATABASE_ENDPOINT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});

const dbQuery = (sql: string, params: string[], limit?: number) => {
    return new Promise((resolve) => {
        const parameters = params.map((param) => {
            return "'"+param+"'";
        })
        if(limit) parameters.push(limit.toString());
        console.log("[DATABASE](N) "+sql.replace(/\?/g, (match) => {return parameters.shift() || "MISSING"}));
        database.query(sql, [...params, limit])
            .then((rows: any) => {
                if(rows) {
                    resolve(rows);
                }
                else {
                    resolve(null);
                }
            })
            .catch((err: any) => {
                console.error(err);
                resolve(null);
            });
    });
}

const dbQueryOne = (sql: string, params: string[]) => {
    const parameters = params.map((param) => {
        return "'"+param+"'";
    })
    console.log("[DATABASE](1) "+sql.replace(/\?/g, (match) => {return parameters.shift() || "MISSING"}));
    return new Promise((resolve) => {
        database.query(sql, params)
            .then((rows: any) => {
                if(rows) {
                    resolve(rows[0]);
                }
                else {
                    resolve(null);
                }
            })
            .catch((err: any) => {
                console.error(err);
                resolve(null);
            });
    });
}

// passport

passport.serializeUser((user: Express.User, done: Function) => done(null, user.id));
passport.deserializeUser(async (id: string, done: Function) => {
    const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [id]);
    done(null, user);
});

// the same strategy handles register, login and link

passport.use("local", new localStrategy({passReqToCallback: true}, async (req: any, username: string, password: string, done: Function) => {
    const user: any = await dbQueryOne("SELECT * FROM local_users WHERE username = ?", [username]);
    // login
    if(user&&!req.body.register) {
        // success
        if(bcrypt.compareSync(password, user.password)) {
            done(null, {id: user.player});
        }
        // fail
        else {
            done(null, false);
        }
    }
    // register
    else if(req.body.register) {
        const hash = bcrypt.hashSync(password, 10);
        var playerId: string;
        // link
        if(req.user) {
            playerId = req.user.id;
        }
        // register
        else {
            playerId = await generateId("players");
            dbQuery("INSERT INTO players (id) VALUES (?)", [playerId]);
        }
        dbQuery("INSERT INTO local_users (username, password, player) VALUES (?, ?, ?)", [username, hash, playerId]);
        done(null, {id: playerId});
    }
    // fail
    else {
        done(null, false);
    }
}));

passport.use("discord", new discordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    callbackURL: process.env.BACKEND_ENDPOINT+"/user/auth/discord",
    scope: ["identify"],
    passReqToCallback: true
}, async (req: Express.Request, accessToken: any, refreshToken: any, profile: any, done: Function) => {
    const user: any = await dbQueryOne("SELECT * FROM discord_users WHERE discord_id = ?", [profile.id]);
    // initialize
    if(!user) {
        await dbQuery("INSERT INTO discord_users (discord_id, discord_username) VALUES (?)", [profile.id, profile.username]);
    }
    // login
    else if(user.player) {
        return done(null, {id: user.player});
    }
    var playerId;
    // link
    if(req.user) {
        playerId = req.user.id;
    }
    // create and link
    else {
        playerId = await generateId("players");
        dbQuery("INSERT INTO players (id) VALUES (?)", [playerId]);
    }
    dbQuery("UPDATE discord_users SET player = ? WHERE discord_id = ?", [playerId, profile.id]);
    return done(null, {id: playerId});
}));

passport.use("minecraft", new localStrategy({passReqToCallback: true}, async (req: Express.Request, username: string, password: string, done: Function) => {
    const authmeAccount: any = await dbQueryOne("SELECT * FROM minecraft.authme WHERE realname = ?", [username]);
    // fail
    if(!authmeAccount||!bcrypt.compareSync(password, authmeAccount.password)) {
        done(null, false);
    }
    const user: any = await dbQueryOne("SELECT * FROM minecraft_players WHERE minecraft_username = ?", [username]);
    // initialize
    if(!user) {
        await dbQuery("INSERT INTO minecraft_players (minecraft_username) VALUES (?)", [username]);
    }
    // login
    else if(user.player) {
        return done(null, {id: user.player});
    }
    var playerId;
    // link
    if(req.user) {
        playerId = req.user.id;
    }
    // create and link
    else {
        playerId = await generateId("players");
        dbQuery("INSERT INTO players (id) VALUES (?)", [playerId]);
    }
    dbQuery("UPDATE minecraft_players SET player = ? WHERE minecraft_username = ?", [playerId, username]);
    return done(null, {id: playerId});
}));

// middlewares:
// - cors
// - session and cookies
// - passport

const app = express();
const corsOptions: cors.CorsOptions = {
    origin: [process.env.FRONTEND_ENDPOINT || "", process.env.BACKEND_ENDPOINT || "", process.env.WEBSITE_ENDPOINT || "", "http://localhost:4000", "http://localhost"],
    credentials: true
};
app.use(cors(corsOptions));
app.use(session({
    secret: process.env.SESSION_SECRET || "daimon",
    resave: true,
    saveUninitialized: true
}));
app.use(cookieParser(process.env.SESSION_SECRET || "daimon"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(passport.initialize());
app.use(passport.session());

// routes

app.get("/", (req: express.Request, res: express.Response) => {
    res.send("daimon api");
});

app.get("/feed/:count", async (req: express.Request, res: express.Response) => {
    console.log("GET /feed");
    const count = Number(req.params.count);
    const feed = await dbQuery("SELECT * FROM feed ORDER BY timestamp DESC LIMIT ?", [], count);
    res.json(feed);
})

app.get("/static/:path", async (req: express.Request, res: express.Response) => {
    // mp4 videos stored locally in the /static folder
    const path = req.params.path;
    res.sendFile(path, {root: "./static"});
});

app.get("/team", async (req: express.Request, res: express.Response) => {
    console.log("GET /team");
    const team = await dbQuery("SELECT * FROM team", []);
    res.json(team);
});

app.get("/jobs", async (req: express.Request, res: express.Response) => {
    console.log("GET /jobs");
    const jobs = await dbQuery("SELECT * FROM jobs", []);
    res.json(jobs);
});

app.get("/user", (req: express.Request, res: express.Response) => {
    if(req.user) {
        res.json(req.user.id);
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/lfg", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        res.json(player.lfg);
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/score", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const score: any = await dbQueryOne("SELECT score FROM players WHERE id = ?", [req.user.id]);
        res.json(score.score);
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/display", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const display: any = await dbQueryOne("SELECT display FROM players WHERE id = ?", [req.user.id]);
        res.json(display.display);
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/auth", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const local = await dbQueryOne("SELECT * FROM local_users WHERE player = ?", [req.user.id]);
        var discord = await dbQueryOne("SELECT * FROM discord_users WHERE player = ?", [req.user.id]);
        if(discord) {
            discord = JSON.parse(JSON.stringify(discord, (key, value) =>
                typeof value === "bigint"
                    ? value.toString()
                    : value // return everything else unchanged
            ));
        }
        const minecraft = await dbQueryOne("SELECT * FROM minecraft_players WHERE player = ?", [req.user.id]);
        res.json({local, discord, minecraft});
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/messages", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const messages = await dbQuery("SELECT m.*, p.display AS player_display, g.display AS guild_display FROM messages m JOIN players p ON m.player = p.id JOIN guilds g ON m.guild = g.id WHERE m.player = ?", [req.user.id]);
        res.json(messages);
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/auth/discord", passport.authenticate("discord", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}));

app.get("/user/auth/logout", (req: express.Request, res: express.Response) => {
    if(req.user) {
        req.logout(() => {
            res.status(200).json("success");
        });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/guild", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild) {
            res.json(guild);
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/guild/leader", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const leader: any = await dbQueryOne("SELECT id FROM guilds WHERE player = ?", [req.user.id]);
        if(leader) {
            res.json(true);
        }
        else {
            res.json(false);
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/guild/messages", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE player = ?", [req.user.id]);
        if(guild) {
            const messages = await dbQuery("SELECT m.*, p.display AS player_display, g.display AS guild_display FROM messages m JOIN players p ON m.player = p.id JOIN guilds g ON m.guild = g.id WHERE m.guild = ?", [guild.id]);
            res.json(messages);
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/guilds", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guilds = await dbQuery("SELECT g.id, g.display, g.score FROM guilds g JOIN players_to_guilds pg ON g.id = pg.guild WHERE pg.player = ?", [req.user.id])
        if(guilds) {
            res.json(guilds);
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/guilds/count", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guilds: any = await dbQuery("SELECT g.id, g.display FROM guilds g JOIN players_to_guilds pg ON g.id = pg.guild WHERE pg.player = ?", [req.user.id])
        if(guilds) {
            res.json(guilds.length);
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.get("/user/character", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.user.id]);
        if(!character) {
            res.status(404).json("notfound");
            return;
        }
        if(character.hair_style) character.hair_style = await dbQueryOne("SELECT * FROM cosmetics WHERE id = ?", [character.hair_style]);
        if(character.facial_hair) character.facial_hair = await dbQueryOne("SELECT * FROM cosmetics WHERE id = ?", [character.facial_hair]);
        res.json(character);
    }
    else {
        res.status(401).json("unauthorized");
    }
})

app.get("/user/character/boolean", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.user.id]);
        if(character) {
            res.json(true);
        }
        else {
            res.json(false);
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
})

app.get('/item/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM items WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
                return;
            }
        }
    );
});

app.get("/cosmetics", async (req: express.Request, res: express.Response) => {
    const cosmetics: any = await dbQuery("SELECT * FROM cosmetics", []);
    res.json(cosmetics);
});

app.get("/guild/:id", async (req: express.Request, res: express.Response) => {
    const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.params.id]);
    if(guild) {
        res.json(guild);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/guild/:id/mainmembers", async (req: express.Request, res: express.Response) => {
    const members = await dbQuery("SELECT p.display, p.id FROM players p JOIN guilds g ON p.guild = g.id WHERE g.id = ?", [req.params.id]);
    if(members) {
        res.json(members);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/guild/:id/members", async (req: express.Request, res: express.Response) => {
    const members = await dbQuery("SELECT p.display, p.id FROM players p JOIN players_to_guilds pg ON p.id = pg.player WHERE pg.guild = ?", [req.params.id]);
    if(members) {
        res.json(members);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/player/:id", async (req: express.Request, res: express.Response) => {
    const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.params.id]);
    const local: any = await dbQueryOne("SELECT * FROM local_users WHERE player = ?", [req.params.id]);
    const discord = await dbQueryOne("SELECT * FROM discord_users WHERE player = ?", [req.params.id]);
    const minecraft = await dbQueryOne("SELECT * FROM minecraft_players WHERE player = ?", [req.params.id]);
    if(!player) {
        res.status(404).json("notfound");
    }
    if(local) {
        player.username = local.username;
    }
    if(discord) {
        player.discord = JSON.parse(JSON.stringify(discord, (key, value) =>
            typeof value === "bigint"
                ? value.toString()
                : value // return everything else unchanged
        ));
    }
    if(minecraft) {
        player.minecraft = minecraft;
    }
    res.json(player);
});

app.get("/player/:id/character", async (req: express.Request, res: express.Response) => {
    const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.params.id]);
    if(character) {
        if(character.hair_style) character.hair_style = await dbQueryOne("SELECT * FROM cosmetics WHERE id = ?", [character.hair_style]);
        if(character.facial_hair) character.facial_hair = await dbQueryOne("SELECT * FROM cosmetics WHERE id = ?", [character.facial_hair]);
        res.json(character);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/player/:id/character/boolean", async (req: express.Request, res: express.Response) => {
    const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.params.id]);
    if(character) {
        res.json(true);
    }
    else {
        res.json(false);
    }
});

app.get("/player/:id/guild", async (req: express.Request, res: express.Response) => {
    const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.params.id]);
    if(player) {
        const guild = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [player.guild]);
        if(guild) {
            res.json(guild);
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/player/:id/guilds", async (req: express.Request, res: express.Response) => {
    const guilds = await dbQuery("SELECT g.id, g.display FROM guilds g JOIN players_to_guilds pg ON g.id = pg.guild WHERE pg.player = ?", [req.params.id])
    if(guilds) {
        res.json(guilds);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/players", async (req: express.Request, res: express.Response) => {
    const players = await dbQuery("SELECT * FROM players", [])
    if(players) {
        res.json(players);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/guilds", async (req: express.Request, res: express.Response) => {
    const guilds = await dbQuery("SELECT * FROM guilds", [])
    if(guilds) {
        res.json(guilds);
    }
    else {
        res.status(404).json("notfound");
    }
});

app.get("/leaderboard/:name", async (req: express.Request, res: express.Response) => {
    const pageSize = 10;
    const name = req.params.name;
    switch(name) {
        case "players":
            const players: any = await dbQuery("SELECT * FROM players", [])
            res.json(Math.ceil(players.length/pageSize));
            break;
        case "guilds":
            const guilds: any = await dbQuery("SELECT * FROM guilds", [])
            res.json(Math.ceil(guilds.length/pageSize));
            break;
        case "minecraft":
            const minecraft: any = await dbQuery("SELECT * FROM minecraft_players", [])
            res.json(Math.ceil(minecraft.length/pageSize));
            break;
        case "minecraft_factions":
            const minecraftFactions: any = await dbQuery("SELECT * FROM minecraft_factions", [])
            res.json(Math.ceil(minecraftFactions.length/pageSize));
            break;
        case "discord":
            const discord: any = await dbQuery("SELECT * FROM discord_users", [])
            res.json(Math.ceil(discord.length/pageSize));
            break;
        default:
            res.status(404).json("notfound");
    }
});

app.get("/leaderboard/:name/:page", async (req: express.Request, res: express.Response) => {
    const pageSize: any = 10;
    const name = req.params.name;
    if(isNaN(parseInt(req.params.page))) {
        res.status(404).json("notfound");
    }
    const page = parseInt(req.params.page);
    const pageOffset = page*pageSize;
    switch(name) {
        case "players":
            const players = await dbQuery("SELECT players.*, guilds.display AS guild_display FROM players LEFT JOIN guilds ON players.guild = guilds.id ORDER BY score DESC LIMIT ? OFFSET ?", [pageSize, pageOffset])
            res.json(players);
            break;
        case "guilds":
            const guilds = await dbQuery("SELECT g.*, p.display AS player_display FROM guilds g LEFT JOIN players p ON g.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?", [pageSize, pageOffset])
            res.json(guilds);
            break;
        case "minecraft":
            const minecraft = await dbQuery("SELECT mp.*, p.display AS player_display FROM minecraft_players mp LEFT JOIN players p ON mp.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?", [pageSize, pageOffset])
            res.json(minecraft);
            break;
        case "minecraft_factions":
            const minecraftFactions = await dbQuery("SELECT mf.*, f.name, g.display AS guild_display FROM minecraft_factions mf JOIN minecraft.mf_faction f ON mf.mf_id = f.id LEFT JOIN guilds g ON mf.guild = g.id ORDER BY score DESC LIMIT ? OFFSET ?", [pageSize, pageOffset])
            res.json(minecraftFactions);
            break;
        case "discord":
            var discord: any = await dbQuery("SELECT ds.*, p.display AS player_display FROM discord_users ds LEFT JOIN players p ON ds.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?", [pageSize, pageOffset])
            discord = JSON.parse(JSON.stringify(discord, (key, value) =>
                typeof value === "bigint"
                    ? value.toString()
                    : value // return everything else unchanged
            ));
            res.json(discord);
            break;
        default:
            res.status(404).json("notfound");
    
    }
});

app.get("/loltest/:name/:tag", async (req: express.Request, res: express.Response) => {

    const skillBonuses = {
        "constitution": 0,
        "strength": 0,
        "agility": 0,
        "dexterity": 0,
        "social": 0,
        "intelligence": 0,
        "aether": 0,
    }

    console.log("GET loltest");
    const versionUrl = "https://ddragon.leagueoflegends.com/api/versions.json"
    const versionResponse = await axios.get(versionUrl);
    const version = versionResponse.data[0];

    const championUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
    const championResponse = await axios.get(championUrl);
    const champion = championResponse.data.data;

    const contentregion = "europe";
    const username = req.params.name;
    const usertag = req.params.tag;
    const puuidUrl = `https://${contentregion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${username}/${usertag}?api_key=${process.env.RIOT_API_KEY}`;
    const puuidResponse = await axios.get(puuidUrl);
    const puuid = puuidResponse.data.puuid;

    const gameregion = "euw1"
    const masteryUrl = `https://${gameregion}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}?api_key=${process.env.RIOT_API_KEY}`;
    const masteryResponse = await axios.get(masteryUrl);
    const mastery = masteryResponse.data;

    const idToChampion: any = Object.values(champion).reduce((acc: any, champ: any) => {
            acc[champ.key] = {
                tags: champ.tags
            };
            return acc;
        }, {});

    const list = mastery.map((entry: any) => {
        const champInfo = idToChampion[entry.championId.toString()];
            if (champInfo) {
                //return `${champInfo.name} (${champInfo.tags.join(", ")}): ${entry.championLevel}`;
                return {tags: champInfo.tags, level: entry.championLevel}
            } else {
                //return `Unknown Champion (${entry.championId}): ${entry.championLevel}`;
            }
    })

    list.forEach((champion: any) => {
        const multiplier = 2/champion.tags.length
        champion.tags.forEach((tag: any) => {
            switch(tag)
            {
                case "Fighter":
                    skillBonuses.strength+=multiplier*champion.level;
                    break;
                case "Assassin":
                    skillBonuses.agility+=multiplier*champion.level;
                    break;
                case "Support":
                    skillBonuses.intelligence+=multiplier*champion.level;
                    break;
                case "Tank":
                    skillBonuses.constitution+=multiplier*champion.level;
                    break;
                case "Marksman":
                    skillBonuses.dexterity+=multiplier*champion.level;
                    break;
                case "Mage":
                    skillBonuses.aether+=multiplier*champion.level;
                    break;
            }
        })
    })

    res.send(skillBonuses);
});

app.get("/favicon.ico", (req: express.Request, res: express.Response) => {
    res.status(404).json("notfound")
});

app.get("*", (req: express.Request, res: express.Response) => {
    console.log("GET "+req.url+" not found");
    res.status(404).json("notfound")
});

app.post("/user/auth/local", passport.authenticate("local"), (req: express.Request, res: express.Response) => {
    res.status(200).json("success");
});

app.post("/user/auth/minecraft", passport.authenticate("minecraft"), (req: express.Request, res: express.Response) => {
    res.status(200).json("success");
});

app.post("/user/display", (req: express.Request, res: express.Response) => {
    if(req.user) {
        const display = req.body.display;
        dbQuery("UPDATE players SET display = ? WHERE id = ?", [display, req.user.id])
            .then(() => {
                res.status(200).json("success");
            });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/lfg", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const lfg: string = user.lfg ? "0" : "1";
        if(user) {
            dbQuery("UPDATE players SET lfg = ? WHERE id = ?", [lfg, req.user.id])
                .then(() => {
                    res.status(200).json("success");
                });
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guild", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const oldGuild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(oldGuild&&oldGuild.player === user.id) {
            res.status(403).json("forbidden");
            return;
        }
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.body.id]);
        if(guild) {
            Promise.all([
                dbQuery("UPDATE players SET guild = ? WHERE id = ?", [guild.id, user.id]),
                dbQuery("DELETE FROM messages WHERE player = ? AND guild = ?", [user.id, guild.id]),
            ])
                .then(() => {
                    res.status(200).json("success");
                });
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guild/lfp", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        const lfp: string = guild.lfp ? "0" : "1";
        if(guild) {
            dbQuery("UPDATE guilds SET lfp = ? WHERE id = ?", [lfp, guild.id])
                .then(() => {
                    res.status(200).json("success");
                });
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guild/display", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player !== user.id) {
            res.status(403).json("forbidden");
            return;
        }
        dbQuery("UPDATE guilds SET display = ? WHERE id = ?", [req.body.display, guild.id])
            .then(() => {
                res.status(200).json("success");
            });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guild/member", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player !== user.id) {
            res.status(403).json("forbidden");
            return;
        }
        const member: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.body.id]);
        if(member) {
            Promise.all([
                dbQuery("INSERT INTO players_to_guilds (player, guild) VALUES (?, ?)", [member.id, guild.id]),
                dbQuery("DELETE FROM messages WHERE player = ? AND guild = ?", [member.id, guild.id])
            ])
                .then(() => {
                    res.status(200).json("success");
                });
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guild/member/kick", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player !== user.id) {
            res.status(403).json("forbidden");
            return;
        }
        const member: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.body.id]);
        if(member) {
            Promise.all([
                dbQuery("DELETE FROM players_to_guilds WHERE player = ? AND guild = ?", [member.id, guild.id]),
                dbQuery("UPDATE players SET guild = NULL WHERE id = ? AND guild = ?", [member.id, guild.id])
            ])
                .then(() => {
                    res.status(200).json("success");
                });
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
})

app.post("/user/guild/member/promote", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player !== user.id) {
            res.status(403).json("forbidden");
            return;
        }
        const member: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.body.id]);
        if(member) {
            if(member.guild === guild.id) {
                dbQueryOne("SELECT * FROM minecraft_factions WHERE guild = ?", [guild.id])
                    .then(async (faction: any) => {
                        if(faction) {
                            dbQuery("UPDATE minecraft_factions SET guild = NULL WHERE id = ?", [faction.id]);
                        }
                    })
                    .then(async () => {
                        const minecraft: any = await dbQueryOne("SELECT * FROM minecraft_players WHERE player = ?", [member.id]);
                            if(minecraft) {
                                const factionUser: any = await dbQueryOne("SELECT * FROM minecraft.mf_player WHERE name = ?", [minecraft.minecraft_username]);
                                if(factionUser) {
                                    const factionMember: any = await dbQueryOne("SELECT * FROM minecraft.mf_faction_member WHERE player_id = ?", [factionUser.id]);
                                    if(factionMember) {
                                        const faction: any = await dbQueryOne("SELECT * FROM minecraft.mf_faction WHERE id = ?", [factionMember.faction_id]);
                                        const roles = JSON.parse(faction.roles);
                                        if(factionMember.role_id === roles[0].id) {
                                            dbQuery("UPDATE minecraft_factions SET guild = ? WHERE id = ?", [guild.id, faction.id]);
                                        }
                                    }
                                }
                            }
                    });
                dbQuery("UPDATE guilds SET player = ? WHERE id = ?", [member.id, guild.id])
                    .then(() => {
                        res.status(200).json("success");
                    });
            }
            else {
                res.status(403).json("forbidden");
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/guilds", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.body.id]);
        if(guild) {
            const message: any = await dbQueryOne("SELECT * FROM messages WHERE type = 0 AND player = ? AND guild = ?", [user.id, guild.id]);
            if(message||guild.lfp) {
                dbQuery("INSERT INTO players_to_guilds (player, guild) VALUES (?, ?)", [user.id, guild.id])
                    .then(() => {
                        if(!user.guild) {
                            dbQuery("UPDATE players SET guild = ? WHERE id = ?", [guild.id, user.id])
                                .then(() => {
                                    res.status(200).json("success");
                                });
                        }
                        else {
                            res.status(200).json("success");
                        }
                    });
            }
            else {
                res.status(403).json("forbidden");
                return;
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/message", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        // types:
        // 0: guild invites user
        // 1: user requests to join guild
        const type = req.body.type;
        const target = req.body.target;

        var user: any;
        var guild: any;

        switch (type) {
            case 0:
                const owner: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
                guild = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [owner.guild]);
                if(guild.player !== owner.id) {
                    res.status(403).json("forbidden");
                    return;
                }
                user = await dbQueryOne("SELECT * FROM players WHERE id = ?", [target]);
                break;
            case 1:
                user = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
                guild = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [target]);
                break;
            default:
                res.status(400).json("badrequest");
        }
        dbQuery("INSERT INTO messages (type, player, guild) VALUES (?, ?, ?)", [type, user.id, guild.id])
            .then(() => {
                res.status(201).json("created");
            });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/message/delete", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const type = req.body.type;
        const player = req.body.player;
        const guild = req.body.guild;
        const message: any = await dbQueryOne("SELECT * FROM messages WHERE type = ? AND player = ? AND guild = ?", [type, player, guild]);
        if(message) {
            const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.body.player]);
            const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.body.guild]);
            const owner: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [guild.player]);
            if(player.id === req.user.id||owner.id === req.user.id) {
                dbQuery("DELETE FROM messages WHERE type = ? AND player = ? AND guild = ?", [type, player.id, guild.id])
                    .then(() => {
                        res.status(200).json("success");
                    });
            }
            else {
                res.status(403).json("forbidden");
                return;
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/guild", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE player = ?", [req.user.id])
        if(guild) {
            res.status(403).json("forbidden");
            return;
        }
        generateId("guilds").then((id: string) => {
            const display = req.body.display;
            const player = req.body.player;
            dbQuery("INSERT INTO guilds (id, display, player) VALUES (?, ?, ?)", [id, display, player])
                .then(() => {
                    Promise.all([
                        (async () => {
                            const minecraft: any = await dbQueryOne("SELECT * FROM minecraft_players WHERE player = ?", [player]);
                            if(minecraft) {
                                const factionUser: any = await dbQueryOne("SELECT * FROM minecraft.mf_player WHERE name = ?", [minecraft.minecraft_username]);
                                if(factionUser) {
                                    const factionMember: any = await dbQueryOne("SELECT * FROM minecraft.mf_faction_member WHERE player_id = ?", [factionUser.id]);
                                    if(factionMember) {
                                        const faction: any = await dbQueryOne("SELECT * FROM minecraft.mf_faction WHERE id = ?", [factionMember.faction_id]);
                                        const roles = JSON.parse(faction.roles);
                                        if(factionMember.role_id === roles[0].id) {
                                            dbQuery("UPDATE minecraft_factions SET guild = ? WHERE id = ?", [id, faction.id]);
                                        }
                                    }
                                }
                            }
                        }),
                        dbQuery("INSERT INTO players_to_guilds (player, guild) VALUES (?, ?)", [player, id]),
                        dbQuery("UPDATE players SET guild = ? WHERE id = ?", [id, player])
                    ]).then(() => {
                        res.status(201).json("created");
                    });
                });
        });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/auth/local/password", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const oldPassword = req.body.password;
        const newPassword = req.body.newPassword;
        const user: any = await dbQueryOne("SELECT * FROM local_users WHERE player = ?", [req.user.id]);
        if(user) {
            if(bcrypt.compareSync(oldPassword, user.password)) {
                const hash = bcrypt.hashSync(newPassword, 10);
                dbQuery("UPDATE local_users SET password = ? WHERE player = ?", [hash, req.user.id]);
                res.status(200).json("success");
            }
            else {
                res.status(403).json("forbidden");
                return;
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/auth/local/username", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const newUsername = req.body.username;
        const password = req.body.password;
        const user: any = await dbQueryOne("SELECT * FROM local_users WHERE player = ?", [req.user.id]);
        if(user) {
            if(bcrypt.compareSync(password, user.password)) {
                dbQuery("UPDATE local_users SET username = ? WHERE player = ?", [newUsername, req.user.id]);
                res.status(200).json("success");
            }
            else {
                res.status(403).json("forbidden");
                return;
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.post("/user/character", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.user.id]);
        if(character) {
            dbQuery("UPDATE characters SET gender = ?, eye_color = ?, hair_color = ?, skin_color = ?, hair_style = ?, facial_hair = ? WHERE id = ?",
            [req.body.gender, req.body.eyeColor, req.body.hairColor, req.body.skinColor, req.body.hairStyle, req.body.facialHair, character.id]);
            res.status(200).json("success");
        }
        else {
            const id = await generateId("characters");
            await dbQuery("INSERT INTO characters (id, gender, eye_color, hair_color, skin_color, hair_style, facial_hair, player) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [id, req.body.gender, req.body.eyeColor, req.body.hairColor, req.body.skinColor, req.body.hairStyle, req.body.facialHair, req.user.id]);
            res.status(201).json("created");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
})

app.post("*", (req: express.Request, res: express.Response) => {
    console.log("POST "+req.url+" not found");
    res.status(404).json("notfound")
});

app.delete("/user", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild = await dbQueryOne("SELECT * FROM guilds WHERE player = ?", [req.user.id]);
        if(guild) {
            res.status(403).json("forbidden");
            return;
        }
        await dbQuery("UPDATE discord_users SET player = NULL WHERE player = ?", [req.user.id]);
        await dbQuery("UPDATE minecraft_players SET player = NULL WHERE player = ?", [req.user.id]);
        await dbQuery("DELETE FROM players_to_guilds WHERE player = ?", [req.user.id]);
        await dbQuery("DELETE FROM messages WHERE player = ?", [req.user.id]);
        await dbQuery("DELETE FROM local_users WHERE player = ?", [req.user.id]);
        const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        if(player&&player.bonus_score) {
            dbQuery("INSERT INTO bonus_score_backup (id, display, bonus_score) VALUES (?, ?, ?)", [player.id, player.display, player.bonus_score]);
        }
        await dbQuery("DELETE FROM players WHERE id = ?", [req.user.id]);
        req.logout(() => {
            res.status(200).json("success");
        });
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.delete("/user/character", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const character: any = await dbQueryOne("SELECT * FROM characters WHERE player = ?", [req.user.id]);
        if(character) {
            dbQuery("DELETE FROM characters WHERE id = ?", [character.id]);
            res.status(200).json("success");
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.delete("/user/guilds/:id", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.params.id]);
        if(guild) {
            const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
            if(player.guild === guild.id) {
                res.status(403).json("forbidden")
                return;
            }
            else {
                dbQuery("DELETE FROM players_to_guilds WHERE player = ? AND guild = ?", [req.user.id, guild.id])
                    .then(() => {
                        res.status(200).json("success");
                    });
            }
        }
        else {
            res.status(404).json("notfound");
        }
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.delete("/user/guild", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [player.guild]);
        if(guild.player !== player.id) {
            res.status(403).json("forbidden");
            return;
        }
        Promise.all([
            dbQuery("UPDATE players SET guild = NULL WHERE guild = ?", [guild.id]),
            dbQuery("DELETE FROM players_to_guilds WHERE guild = ?", [guild.id]),
            dbQuery("DELETE FROM messages WHERE guild = ?", [guild.id]),
            dbQuery("UPDATE minecraft_factions SET guild = NULL WHERE guild = ?", [guild.id]),
        ])
            .then(() => {
                dbQuery("DELETE FROM guilds WHERE id = ?", [guild.id])
                    .then(() => {
                        res.status(200).json("success");
                    });
            });
    }
    else {
        res.status(401).json("unauthorized");
    }
})

app.delete("/user/auth/:service", (req: express.Request, res: express.Response) => {
    if(req.user) {
        // if this is the last service the user has, refuse to unlink
        Promise.all([
            dbQueryOne("SELECT * FROM local_users WHERE player = ?", [req.user.id]),
            dbQueryOne("SELECT * FROM discord_users WHERE player = ?", [req.user.id]),
            dbQueryOne("SELECT * FROM minecraft_players WHERE player = ?", [req.user.id])
        ]).then((results: any) => {
            var count = 0;
            results.forEach((result: any) => {
                if(result) {
                    count++;
                }
            });
            if(count < 2) {
                res.status(403).json("forbidden");
                return;
            }
        });
        if(req.params.service === "local") {
            dbQuery("DELETE FROM local_users WHERE player = ?", [req.user.id]);
        }
        else if(req.params.service === "discord") {
            dbQuery("UPDATE discord_users SET player = NULL WHERE player = ?", [req.user.id]);
        }
        else if(req.params.service === "minecraft") {
            dbQuery("UPDATE minecraft_players SET player = NULL WHERE player = ?", [req.user.id]);
        }
        res.status(200).json("success");
    }
    else {
        res.status(401).json("unauthorized");
    }
});

app.delete("*", (req: express.Request, res: express.Response) => {
    console.log("DELETE "+req.url+" not found");
    res.status(404).json("notfound")
});

// server

const server = http.createServer(app);
server.listen(process.env.PORT,()=>console.log(`[BACKEND] Server Start Successful.`));
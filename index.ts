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
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";
import { userInfo } from "os";

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
    type tableName = "players" | "guilds" | "messages" | "players_to_guilds" | "discord_users" | "minecraft_players" | "local_users" | "minecraft_factions";
}

// utility functions

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

function capitalizeFirstLetter(string: String) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// vault access

const database = mariadb.createPool({
    host: process.env.DATABASE_ENDPOINT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});

const s3 = new S3Client({
    region: process.env.S3_REGION
});

const dbQuery = (sql: string, params: string[]) => {
    return new Promise((resolve) => {
        const parameters = params.map((param) => {
            return "'"+param+"'";
        })
        console.log("[DATABASE](N) "+sql.replace(/\?/g, (match) => {return parameters.shift() || "MISSING"}));
        database.query(sql, params)
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

const s3Query = (path: string) => {
    return new Promise((resolve) => {
        s3.send(new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path
        }))
            .then((data: any) => {
                data.Body.transformToString()
                    .then((body: any) => {
                        resolve(body);
                    });
            })
            .catch((err: any) => {
                console.error(err);
                resolve(null);
            });
    })
};

const s3Create = (path: string, body: any) => {
    return new Promise<boolean>((resolve) => {
        s3.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path,
            Body: body
        }))
            .then(() => {
                resolve(true);
            })
            .catch((err: any) => {
                console.error(err);
                resolve(false);
            });
    })
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

// middleware

const app = express();
const corsOptions: cors.CorsOptions = {
    origin: [process.env.FRONTEND_ENDPOINT || "", process.env.BACKEND_ENDPOINT || "", "http://localhost:4000", "http://localhost", "https://masterbaseguild.it"],
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
const server = http.createServer(app);

// routes

app.get("/", (req: express.Request, res: express.Response) => {
    res.send("daimon api");
});

app.get("/user", (req: express.Request, res: express.Response) => {
    res.json(req.user);
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

app.get("/user/guild/messages", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player === user.id) {
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

app.get("*", (req: express.Request, res: express.Response) => {
    console.log("GET "+req.url+" not found");
    res.status(404).json("notfound")
});

app.post("/user/auth/local", passport.authenticate("local", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}), (req: express.Request, res: express.Response) => {
    res.status(200).json("success");
});

app.post("/user/auth/minecraft", passport.authenticate("minecraft", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}), (req: express.Request, res: express.Response) => {
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

app.post("/user/guild/member", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const user: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [user.guild]);
        if(guild.player !== user.id) {
            res.status(403).json("forbidden");
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
        dbQuery("INSERT INTO messages (type, player, guild) VALUES (?, ?, ?)", [type, user, guild])
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

app.post("*", (req: express.Request, res: express.Response) => {
    console.log("POST "+req.url+" not found");
    res.status(404).json("notfound")
});

app.delete("/user", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild = await dbQueryOne("SELECT * FROM guilds WHERE player = ?", [req.user.id]);
        if(guild) {
            res.status(403).json("forbidden");
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

//user/guilds/:id
app.delete("/user/guilds/:id", async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const guild: any = await dbQueryOne("SELECT * FROM guilds WHERE id = ?", [req.params.id]);
        if(guild) {
            const player: any = await dbQueryOne("SELECT * FROM players WHERE id = ?", [req.user.id]);
            if(player.guild === guild.id) {
                res.status(403).json("forbidden")
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

app.delete("/user/auth/:service", (req: express.Request, res: express.Response) => {
    if(req.user) {
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


server.listen(process.env.PORT,()=>console.log(`[BACKEND] Server Start Successful.`));
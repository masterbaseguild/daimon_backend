import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as localStrategy } from 'passport-local';
import { Strategy as discordStrategy } from 'passport-discord';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import http from 'http';
import mariadb from 'mariadb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import 'dotenv/config';

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
    type tableName = 'players' | 'guilds' | 'messages' | 'players_to_guilds' | 'discord_users' | 'minecraft_players' | 'local_users' | 'minecraft_factions';
}

// utility functions

const generateId = (table: tableName) => {
    return new Promise<string>((resolve) => {
        const id = crypto.randomBytes(6).toString('hex');
        checkId(id, table).then((result: boolean) => {
            if (result) generateId(table);
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
    const user: any = await dbQueryOne('SELECT * FROM players WHERE id = ?', [id]);
    done(null, user);
});

// the same strategy handles register, login and link

passport.use("local", new localStrategy({passReqToCallback: true}, async (req: any, username: string, password: string, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM local_users WHERE username = ?', [username]);
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
    else if (req.body.register) {
        const hash = bcrypt.hashSync(password, 10);
        var playerId: string;
        // link
        if (req.user) {
            playerId = req.user.id;
        }
        // register
        else {
            playerId = await generateId('players');
            dbQuery('INSERT INTO players (id) VALUES (?)', [playerId]);
        }
        dbQuery('INSERT INTO local_users (username, password, player) VALUES (?, ?, ?)', [username, hash, playerId]);
        done(null, {id: playerId});
    }
    // fail
    else {
        done(null, false);
    }
}));

passport.use("discord", new discordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    callbackURL: process.env.BACKEND_ENDPOINT+"/login/discord",
    scope: ['identify'],
    passReqToCallback: true
}, async (req: Express.Request, accessToken: any, refreshToken: any, profile: any, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM discord_users WHERE discord_id = ?', [profile.id]);
    // initialize
    if(!user) {
        await dbQuery('INSERT INTO discord_users (discord_id, discord_username) VALUES (?)', [profile.id, profile.username]);
    }
    // login
    else if (user.player) {
        return done(null, {id: user.player});
    }
    var playerId;
    // link
    if (req.user) {
        playerId = req.user.id;
    }
    // create and link
    else {
        playerId = await generateId('players');
        dbQuery('INSERT INTO players (id) VALUES (?)', [playerId]);
    }
    dbQuery('UPDATE discord_users SET player = ? WHERE discord_id = ?', [playerId, profile.id]);
    return done(null, {id: playerId});
}));

passport.use("minecraft", new localStrategy({passReqToCallback: true}, async (req: Express.Request, username: string, password: string, done: Function) => {
    const authmeAccount: any = await dbQueryOne('SELECT * FROM minecraft.authme WHERE realname = ?', [username]);
    // fail
    if(!authmeAccount||!bcrypt.compareSync(password, authmeAccount.password)) {
        done(null, false);
    }
    const user: any = await dbQueryOne('SELECT * FROM minecraft_players WHERE minecraft_username = ?', [username]);
    // initialize
    if(!user) {
        await dbQuery('INSERT INTO minecraft_players (minecraft_username) VALUES (?)', [username]);
    }
    // login
    else if (user.player) {
        return done(null, {id: user.player});
    }
    var playerId;
    // link
    if (req.user) {
        playerId = req.user.id;
    }
    // create and link
    else {
        playerId = await generateId('players');
        dbQuery('INSERT INTO players (id) VALUES (?)', [playerId]);
    }
    dbQuery('UPDATE minecraft_players SET player = ? WHERE minecraft_username = ?', [playerId, username]);
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
    secret: process.env.SESSION_SECRET || 'daimon',
    resave: true,
    saveUninitialized: true
}));
app.use(cookieParser(process.env.SESSION_SECRET || 'daimon'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(passport.initialize());
app.use(passport.session());
const server = http.createServer(app);

// routes

app.get('/', (req: express.Request, res: express.Response) => {
    res.send('daimon api');
});

app.get('/user', (req: express.Request, res: express.Response) => {
    res.json(req.user);
});

app.get('/user/auths', async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const local = await dbQueryOne('SELECT * FROM local_users WHERE player = ?', [req.user.id]);
        var discord = await dbQueryOne('SELECT * FROM discord_users WHERE player = ?', [req.user.id]);
        if(discord) {
            discord = JSON.parse(JSON.stringify(discord, (key, value) =>
                typeof value === 'bigint'
                    ? value.toString()
                    : value // return everything else unchanged
            ));
        }
        const minecraft = await dbQueryOne('SELECT * FROM minecraft_players WHERE player = ?', [req.user.id]);
        res.json({local, discord, minecraft});
    }
});

app.get('/user/guildowner', (req: express.Request, res: express.Response) => {
    if(req.user) {
        dbQueryOne('SELECT * FROM guilds WHERE player = ?', [req.user.id])
            .then((row: any) => {
                if(row) {
                    res.json(true);
                }
                else {
                    res.json(false);
                }
            });
    }
});

app.get('/user/guilds', (req: express.Request, res: express.Response) => {
    if(req.user) {
        // get main guild from players.guild
        dbQueryOne('SELECT * FROM guilds WHERE id = (SELECT guild FROM players WHERE id = ?)', [req.user.id])
            .then((row: any) => {
                if(req.user&&row) {
                    // get all the other guilds, but only the id and display, from players_to_guilds
                    dbQuery('SELECT g.id, g.display FROM guilds g JOIN players_to_guilds pg ON g.id = pg.guild WHERE pg.player = ?', [req.user.id])
                        .then((rows: any) => {
                            res.json({main: row, guilds: rows});
                        });
                }
                else {
                    res.status(404).json('notfound');
                }
            });
    }
});

app.get('/player/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM players WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/player/:id/messages', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM messages WHERE player = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/player/:id/guilds', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM players_to_guilds WHERE player = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/player/:id/discord', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM discord_users WHERE player = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row.score);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/player/:id/minecraft', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM minecraft_players WHERE player = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row.score);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/guilds', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM guilds', [])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/guild/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM guilds WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/guild/:id/messages', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM messages WHERE guild = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/guild/:id/players', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM players_to_guilds WHERE guild = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/guild/:id/minecraft', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM minecraft_factions WHERE guild = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row.score);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/leaderboards', async (req: express.Request, res: express.Response) => {
    const players = await dbQuery('SELECT * FROM players', [])
    const guilds = await dbQuery('SELECT * FROM guilds', [])
    const minecraft = await dbQuery('SELECT * FROM minecraft_players', [])
    const minecraftFactions = await dbQuery('SELECT mf.*, f.name FROM minecraft_factions mf RIGHT JOIN minecraft.mf_faction f ON mf.mf_id = f.id', [])
    var discord: any = await dbQuery('SELECT * FROM discord_users', [])
    discord = JSON.parse(JSON.stringify(discord, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value // return everything else unchanged
    ));
    res.json({players, guilds, minecraft, minecraftFactions, discord});
});

//leaderboard/:name/:page
app.get('/leaderboard/:name/:page', async (req: express.Request, res: express.Response) => {
    const pageSize: any = 10;
    const name = req.params.name;
    // if cannot parse page, return 404
    if(isNaN(parseInt(req.params.page))) {
        res.status(404).json('notfound');
        return;
    }
    const page = parseInt(req.params.page);
    const pageOffset = page*pageSize;
    //switch for name: players, guilds, minecraft, minecraft_factions, discord
    switch(name) {
        // join guild.display to players where players.guild = guild.id
        case 'players':
            const players = await dbQuery('SELECT players.*, guilds.display AS guild_display FROM players LEFT JOIN guilds ON players.guild = guilds.id ORDER BY score DESC LIMIT ? OFFSET ?', [pageSize, pageOffset])
            res.json(players);
            break;
        // join player.display to guilds where guilds.player = player.id
        case 'guilds':
            const guilds = await dbQuery('SELECT g.*, p.display AS player_display FROM guilds g LEFT JOIN players p ON g.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?', [pageSize, pageOffset])
            res.json(guilds);
            break;
        // join player.display to minecraft_players where minecraft_players.player = player.id
        case 'minecraft':
            const minecraft = await dbQuery('SELECT mp.*, p.display AS player_display FROM minecraft_players mp LEFT JOIN players p ON mp.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?', [pageSize, pageOffset])
            res.json(minecraft);
            break;
        // join guild.display to minecraft_factions where minecraft_factions.guild = guild.id
        case 'minecraft_factions':
            const minecraftFactions = await dbQuery('SELECT mf.*, f.name, g.display AS guild_display FROM minecraft_factions mf JOIN minecraft.mf_faction f ON mf.mf_id = f.id LEFT JOIN guilds g ON mf.guild = g.id ORDER BY score DESC LIMIT ? OFFSET ?', [pageSize, pageOffset])
            res.json(minecraftFactions);
            break;
        // join player.display to discord_users where discord_users.player = player.id
        case 'discord':
            var discord: any = await dbQuery('SELECT ds.*, p.display AS player_display FROM discord_users ds LEFT JOIN players p ON ds.player = p.id ORDER BY score DESC LIMIT ? OFFSET ?', [pageSize, pageOffset])
            discord = JSON.parse(JSON.stringify(discord, (key, value) =>
                typeof value === 'bigint'
                    ? value.toString()
                    : value // return everything else unchanged
            ));
            res.json(discord);
            break;
        default:
            res.status(404).json('notfound');
    
    }
});

app.get('/leaderboard/:name', async (req: express.Request, res: express.Response) => {
    // return how many pages there are
    const pageSize = 10;
    const name = req.params.name;
    //switch for name: players, guilds, minecraft, minecraft_factions, discord
    switch(name) {
        case 'players':
            const players: any = await dbQuery('SELECT * FROM players', [])
            res.json(Math.ceil(players.length/pageSize));
            break;
        case 'guilds':
            const guilds: any = await dbQuery('SELECT * FROM guilds', [])
            res.json(Math.ceil(guilds.length/pageSize));
            break;
        case 'minecraft':
            const minecraft: any = await dbQuery('SELECT * FROM minecraft_players', [])
            res.json(Math.ceil(minecraft.length/pageSize));
            break;
        case 'minecraft_factions':
            const minecraftFactions: any = await dbQuery('SELECT * FROM minecraft_factions', [])
            res.json(Math.ceil(minecraftFactions.length/pageSize));
            break;
        case 'discord':
            const discord: any = await dbQuery('SELECT * FROM discord_users', [])
            res.json(Math.ceil(discord.length/pageSize));
            break;
        default:
            res.status(404).json('notfound');
    }
});

app.get('/login/discord', passport.authenticate("discord", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}));

app.get('*', (req: express.Request, res: express.Response) => {
    console.log("GET "+req.url+" not found");
    res.status(404).json('notfound')
});

app.post('/login/local', passport.authenticate("local", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}), (req: express.Request, res: express.Response) => {
    res.status(200).json('success');
});

app.post('/login/minecraft', passport.authenticate("minecraft", {successRedirect: process.env.FRONTEND_ENDPOINT+"/account", failureRedirect: process.env.FRONTEND_ENDPOINT}), (req: express.Request, res: express.Response) => {
    res.status(200).json('success');
});

app.post('/player', (req: express.Request, res: express.Response) => {
    if(req.user) {
        const display = req.body.display;
        dbQuery('UPDATE players SET display = ? WHERE id = ?', [display, req.user.id])
            .then(() => {
                res.status(200).json('success');
            });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/player/display', (req: express.Request, res: express.Response) => {
    if(req.user) {
        const display = req.body.display;
        dbQuery('UPDATE players SET display = ? WHERE id = ?', [display, req.user.id])
            .then(() => {
                res.status(200).json('success');
            });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/logout', (req: express.Request, res: express.Response) => {
    if(req.user) {
        req.logout(() => {
            res.status(200).json('success');
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/message', (req: express.Request, res: express.Response) => {
    if(req.user) {
        const type = req.body.type;
        const guild = req.body.guild;
        const user = req.body.user;
        dbQuery('INSERT INTO messages (type, user, guild) VALUES (?, ?, ?)', [type, user, guild])
            .then(() => {
                res.status(201).json('created');
            });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/guild', (req: express.Request, res: express.Response) => {
    if(req.user) {
        dbQueryOne('SELECT * FROM guilds WHERE player = ?', [req.user.id])
            .then((row: any) => {
                if(row) {
                    res.status(403).json('forbidden');
                }
            });
        generateId('guilds').then((id: string) => {
            const display = req.body.display;
            const player = req.body.player;
            dbQuery('INSERT INTO guilds (id, display, player) VALUES (?, ?, ?)', [id, display, player])
                .then(() => {
                    dbQuery('INSERT INTO players_to_guilds (player, guild) VALUES (?, ?)', [player, id])
                        .then(() => {
                            dbQuery('UPDATE players SET guild = ? WHERE id = ?', [id, player])
                                .then(() => {
                                    res.status(201).json('created');
                                });
                        });
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

//user/password
app.post('/user/password', async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const oldPassword = req.body.password;
        const newPassword = req.body.newPassword;
        const user: any = await dbQueryOne('SELECT * FROM local_users WHERE player = ?', [req.user.id]);
        if(user) {
            if(bcrypt.compareSync(oldPassword, user.password)) {
                const hash = bcrypt.hashSync(newPassword, 10);
                dbQuery('UPDATE local_users SET password = ? WHERE player = ?', [hash, req.user.id]);
                res.status(200).json('success');
            }
            else {
                res.status(403).json('forbidden');
            }
        }
        else {
            res.status(404).json('notfound');
        }
    }
    else {
        res.status(401).json('unauthorized');
    }
});

//user/username
app.post('/user/username', async (req: express.Request, res: express.Response) => {
    if(req.user) {
        const newUsername = req.body.username;
        const password = req.body.password;
        const user: any = await dbQueryOne('SELECT * FROM local_users WHERE player = ?', [req.user.id]);
        if(user) {
            if(bcrypt.compareSync(password, user.password)) {
                dbQuery('UPDATE local_users SET username = ? WHERE player = ?', [newUsername, req.user.id]);
                res.status(200).json('success');
            }
            else {
                res.status(403).json('forbidden');
            }
        }
        else {
            res.status(404).json('notfound');
        }
    }
});

app.post('*', (req: express.Request, res: express.Response) => {
    console.log("POST "+req.url+" not found");
    res.status(404).json('notfound')
});

app.delete('/user/auths/:service', (req: express.Request, res: express.Response) => {
    if(req.user) {
        if(req.params.service === 'local') {
            dbQuery('DELETE FROM local_users WHERE player = ?', [req.user.id]);
        }
        else if(req.params.service === 'discord') {
            dbQuery('UPDATE discord_users SET player = NULL WHERE player = ?', [req.user.id]);
        }
        else if(req.params.service === 'minecraft') {
            dbQuery('UPDATE minecraft_players SET player = NULL WHERE player = ?', [req.user.id]);
        }
        res.status(200).json('success');
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.delete('/user', async (req: express.Request, res: express.Response) => {
    if(req.user) {
        // if the player has a guild, refuse to delete
        const guild = await dbQueryOne('SELECT * FROM guilds WHERE player = ?', [req.user.id]);
        if(guild) {
            res.status(403).json('forbidden');
            return;
        }
        // unlink minecraft and discord, if linked
        await dbQuery('UPDATE discord_users SET player = NULL WHERE player = ?', [req.user.id]);
        await dbQuery('UPDATE minecraft_players SET player = NULL WHERE player = ?', [req.user.id]);
        // remove player from all guilds
        await dbQuery('DELETE FROM players_to_guilds WHERE player = ?', [req.user.id]);
        // remove all messages involving the player
        await dbQuery('DELETE FROM messages WHERE player = ?', [req.user.id]);
        // delete the local user
        await dbQuery('DELETE FROM local_users WHERE player = ?', [req.user.id]);
        // if player has bonus score, store id, display and bonus_score in the bonus_score_backup table
        const player: any = await dbQueryOne('SELECT * FROM players WHERE id = ?', [req.user.id]);
        if(player&&player.bonus_score) {
            dbQuery('INSERT INTO bonus_score_backup (id, display, bonus_score) VALUES (?, ?, ?)', [player.id, player.display, player.bonus_score]);
        }
        // delete the player
        await dbQuery('DELETE FROM players WHERE id = ?', [req.user.id]);
        req.logout(() => {
            res.status(200).json('success');
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.delete('*', (req: express.Request, res: express.Response) => {
    console.log("DELETE "+req.url+" not found");
    res.status(404).json('notfound')
});


server.listen(process.env.PORT,()=>console.log(`Server Start Successful.`));
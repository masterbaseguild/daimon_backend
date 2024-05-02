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
                console.log(err);
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
                console.log(err);
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
                        console.log(body);
                        resolve(body);
                    });
            })
            .catch((err: any) => {
                console.log(err);
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
                console.log(err);
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
    callbackURL: "http://localhost/login/discord",
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
app.use(cors({origin:[process.env.BACKEND_ENDPOINT||'',process.env.FRONTEND_ENDPOINT||"","https://projectdaimon.com","http://localhost:4000","https://masterbaseguild.it"], credentials: true}));
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
    console.log('ping!');
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

app.get('/login/discord', passport.authenticate("discord", {successRedirect: "http://localhost:4000/account", failureRedirect: "http://localhost:4000"}));

app.get('*', (req: express.Request, res: express.Response) => res.status(404).json('notfound'));

app.post('/login/local', passport.authenticate("local", {successRedirect: "http://localhost:4000/account", failureRedirect: "http://localhost:4000/account"}), (req: express.Request, res: express.Response) => {
    res.status(200).json('success');
});

app.post('/login/minecraft', passport.authenticate("minecraft", {successRedirect: "http://localhost:4000/account", failureRedirect: "http://localhost:4000/account"}), (req: express.Request, res: express.Response) => {
    res.status(200).json('success');
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
        generateId('guilds').then((id: string) => {
            const display = req.body.display;
            const player = req.body.player;
            dbQuery('INSERT INTO guilds (id, display, player) VALUES (?, ?, ?)', [id, display, player])
                .then(() => {
                    res.status(201).json('created');
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('*', (req: express.Request, res: express.Response) => res.status(404).json('notfound'));


server.listen(process.env.PORT,()=>console.log(`Server Start Successful. Database Name: ${process.env.DATABASE_NAME}`));
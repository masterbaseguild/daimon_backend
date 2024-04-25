import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as localStrategy } from 'passport-local';
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
            username: string;
            password: string;
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

passport.serializeUser((user: Express.User, done: Function) => done(null, user.username));
passport.deserializeUser(async (username: string, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM local_users WHERE username = ?', [username]);
    done(null, user);
});
passport.use(new localStrategy(async (username: string, password: string, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM local_users WHERE username = ?', [username]);
    if (!user) return done(null, false);
    if (!user.local) return done(null, false);
    else bcrypt.compare(password, user.local, (error: Error, result: boolean) => {
        if (error) throw error;
        if (result === true)
        {
            delete user.local;
            return done(null, user);
        }
        else return done(null, false);
    });
}));

// middleware

const app = express();
app.use(cors({origin:['https://projectdaimon.com','http://localhost:4000','https://leagues.masterbaseguild.it'], credentials: true}));
app.use(session({
    secret: process.env.SESSION_SECRET || 'daimon',
    resave: true,
    saveUninitialized: true
}));
app.use(cookieParser('daimon'));
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

app.get('*', (req: express.Request, res: express.Response) => res.status(404).json('notfound'));

app.post('/register/local', (req: express.Request, res: express.Response) => {
    const username = req.body.username;
    const password = req.body.password;
    dbQueryOne('SELECT * FROM local_users WHERE username = ?', [username])
        .then((row: any) => {
            if(row) {
                res.status(409).json('conflict');
            }
            else {
                bcrypt.hash(password, 10, (error: Error, hash: string) => {
                    if (error) throw error;
                    dbQuery('INSERT INTO local_users (username, local) VALUES (?, ?, ?)', [username, hash])
                        .then(() => {
                            res.status(201).json('created');
                        });
                });
            }
    });
});

app.post('/login/local', passport.authenticate('local'), (req: express.Request, res: express.Response) => {
    res.status(200).json('success');
});

app.post('/logout', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        req.logout(() => {
            res.status(200).json('success');
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/unregister/local', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        const username = req.body.username;
        const password = req.body.password;
        dbQueryOne('SELECT * FROM local_users WHERE username = ?', [username])
            .then((row: any) => {
                if(row) {
                    bcrypt.compare(password, row.local, (error: Error, result: boolean) => {
                        if (error) throw error;
                        if (result === true)
                        {
                            dbQuery('DELETE FROM local_users WHERE username = ?', [username])
                                .then(() => {
                                    res.status(200).json('success');
                                });
                        }
                        else res.status(401).json('unauthorized');
                    });
                }
                else {
                    res.status(404).json('notfound');
                }
            });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/message', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
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
    if(req.isAuthenticated()) {
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
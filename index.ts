import express from 'express';
//import sqlite3 from 'sqlite3';
import cors from 'cors';
//import fs from 'fs';
import passport from 'passport';
import { Strategy as localStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import WebSocket from 'ws';
import http from 'http';
import mariadb from 'mariadb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import 'dotenv/config';

const spawnpoint = '000000000000'
const spawnbalance = 1000
const maxCharactersPerUser = 3
const maxAuthorsPerUser = 3

declare global {
    namespace Express {
        interface User {
            id: string;
            username: string;
            local: string;
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
}

//const localDb = new sqlite3.Database('../database/daimon.db');
const database = mariadb.createPool({
    host: process.env.DATABASE_ENDPOINT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});
database.getConnection()

const s3 = new S3Client({
    region: process.env.S3_REGION
});

const generateId = (table: string) => {
    return new Promise<string>((resolve) => {
        const id = crypto.randomBytes(6).toString('hex');
        checkId(id, table).then((result: boolean) => {
            if (result) generateId(table);
            else resolve(id);
        });
    });
};

// questa funzione controlla se esiste una risorsa con quell'id e quella tabella
const checkId = (id: string, table: string) => {
    return new Promise<boolean>((resolve) => {
        dbQueryOne(`SELECT * FROM ${table} WHERE id = ?`, [id])
            .then((row: any) => {
                if(row) resolve(true);
                else resolve(false);
            });
    });
};

// questa funzione controlla se l'utente ha già superato il limite di personaggi
const checkCharacterLimitReached = (user: string) => {
    return new Promise<any>((resolve) => {
        dbQuery('SELECT * FROM characters WHERE user = ?', [user])
            .then((rows: any) => {
                if(rows&&rows.length>maxCharactersPerUser) resolve(true);
                else resolve(false);
            });
    });
};

const checkAuthorLimitReached = (user: string) => {
    return new Promise<any>((resolve) => {
        dbQuery('SELECT * FROM authors WHERE user = ?', [user])
            .then((rows: any) => {
                if(rows&&rows.length>maxAuthorsPerUser) resolve(true);
                else resolve(false);
            });
    });
}

// questa funzione controlla se l'utente ha già un personaggio con quel nome
const checkCharacterNameTakenByUser = (user: string, name: string) => {
    return new Promise<any>((resolve) => {
        dbQueryOne('SELECT * FROM characters WHERE user = ? AND name = ?', [user, name])
            .then((row: any) => {
                if(row) {
                    resolve(true);
                }
                else {
                    resolve(false);
                }
            });
    });
}

// questa funzione controlla se il character ha una guild
const checkCharacterAlreadyInGuild = (character: string) => {
    return new Promise<any>((resolve) => {
        dbQueryOne('SELECT guild FROM characters WHERE id = ?', [character])
            .then((row: any) => {
                if(row) {
                    if(row.guild) {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                }
                else {
                    resolve(false);
                }
            });
    })
}

const checkCharacterIsGuildOwner = (guild: string, character: string) => {
    return new Promise<any>((resolve) => {
        dbQueryOne('SELECT * FROM guilds WHERE id = ? AND holder = ?', [guild, character])
            .then((row: any) => {
                if(row) {
                    resolve(true);
                }
                else {
                    resolve(false);
                }
            });
    });
}

const getCharacterOwner = (character: string) => {
    return new Promise<any>((resolve) => {
        dbQueryOne('SELECT * FROM characters WHERE id = ?', [character])
            .then((row: any) => {
                if(row) {
                    resolve(row.user);
                }
                else {
                    resolve(null);
                }
            });
    });
}

/* const localDbQuery = (sql: string, params: string[]) => {
    return new Promise((resolve) => {
        localDb.all(sql, params, (err, rows) => {
            if (err) {
                console.log(err);
                resolve(null);
            } else {
                resolve(rows);
            }
        });
    });
}; */

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

/* const localDbQueryOne = (sql: string, params: string[]) => {
    return new Promise((resolve) => {
        localDb.get(sql, params, (err, row) => {
            if (err) {
                console.log(err);
                resolve(null);
            } else {
                resolve(row);
            }
        });
    });
}; */

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

/* const localS3Query = (path: string) => {
    const root = '../localDb/bucket/';
    return new Promise((resolve) => {
        fs.readFile(root+path, (err, data) => {
            if (err) {
                console.log(err);
                resolve(null);
            } else {
                resolve(data);
            }
        }
    )});
}; */

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
                console.log(err);
                resolve(null);
            });
    })
};

/* const localS3Create = (path: string, body: any) => {
    const root = '../localDb/bucket/';
    return new Promise<boolean>((resolve) => {
        fs.writeFile(root+path, body, (err) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                resolve(true);
            }
        })
    });
}; */

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

passport.serializeUser((user: Express.User, done: Function) => done(null, user.id));
passport.deserializeUser(async (id: string, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM users WHERE id = ?', [id]);
    done(null, user);
});
passport.use(new localStrategy(async (username: string, password: string, done: Function) => {
    const user: any = await dbQueryOne('SELECT * FROM users WHERE username = ?', [username]);
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

const app = express();
app.use(cors({origin:['https://api.projectdaimon.com'], credentials: true}));
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
const ws = new WebSocket.Server({ server });

app.get('/', (req: express.Request, res: express.Response) => {
    console.log('ping!');
    res.send('daimon api');
});

app.get('/event', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM events ORDER BY "ind" DESC', [])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/user', (req: express.Request, res: express.Response) => {
    res.json(req.user);
});

app.get('/area/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM areas WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/article/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM articles WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                s3Query(`articles/${row.id}.md`)
                    .then((data: any) => {
                        if(data) {
                            row.body = data;
                            res.json(row);
                        }
                        else {
                            res.status(404).json('notfound');
                        }
                    });
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/authors', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM authors', [])
        .then((rows: any) => {
            if(rows) {
                res.json(rows);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/author/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM authors WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/cancreateauthor', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        checkAuthorLimitReached(req.user?.id).then((result: boolean) => {
            if(result) {
                res.status(409).json(false);
            }
            else {
                res.status(200).json(true);
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.get('/cancreatecharacter', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        checkCharacterLimitReached(req.user?.id).then((result: boolean) => {
            if(result) {
                res.status(409).json(false);
            }
            else {
                res.status(200).json(true);
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.get('/characters', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        dbQuery('SELECT * FROM characters WHERE user = ?', [req.user?.id])
            .then((rows: any) => {
                if(rows) {
                    res.json(rows);
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

app.get('/character/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM characters WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/cosmetic/:type', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM cosmetics WHERE type = ?', [req.params.type])
        .then((rows: any) => {
            if(rows) {
                res.json(rows);
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

app.get('/invite/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM invites WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/item/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM items WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                if(row.type===3)
                    res.json(row);
                if(row.type===1||row.type===2)
                    s3Query(`blocks/${row.id}.png`)
                        .then((data: any) => {
                            if(data) {
                                row.body = data;
                                res.json(row);
                            }
                            else {
                                res.status(404).json('notfound');
                            }
                        });
                else if(row.type===4||row.type===6)
                    s3Query(`models/${row.id}.obj`)
                        .then((data: any) => {
                            if(data) {
                                row.body = data;
                                res.json(row);
                            }
                            else {
                                res.status(404).json('notfound');
                            }
                        });
                else
                    s3Query(`items/${row.id}.png`)
                        .then((data: any) => {
                            if(data) {
                                row.body = data;
                                res.json(row);
                            }
                            else {
                                res.status(404).json('notfound');
                            }
                        }
                    );
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/pack/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM packs WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/route/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM routes WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/screen/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM screens WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                s3Query(`screens/${row.id}.png`)
                    .then((data: any) => {
                        if(data) {
                            row.body = data;
                            res.json(row);
                        }
                        else {
                            res.status(404).json('notfound');
                        }
                    });
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/skills', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM skills', [])
        .then((rows: any) => {
            if(rows) {
                res.json(rows);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('/skill/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM skills WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/track/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM tracks WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                s3Query(`tracks/${row.id}.mp3`)
                    .then((data: any) => {
                        if(data) {
                            row.body = data;
                            res.json(row);
                        }
                        else {
                            res.status(404).json('notfound');
                        }
                    });
            }
            else {
                res.status(404).json('notfound');
            }
        }
    );
});

app.get('/user/:id', (req: express.Request, res: express.Response) => {
    dbQueryOne('SELECT * FROM users WHERE id = ?', [req.params.id])
        .then((row: any) => {
            if(row) {
                delete row.local;
                res.json(row);
            }
            else {
                res.status(404).json('notfound');
            }
        });
});

app.get('*', (req: express.Request, res: express.Response) => res.status(404).json('notfound'));

app.post('/register', (req: express.Request, res: express.Response) => {
    const username = req.body.username;
    const password = req.body.password;
    dbQueryOne('SELECT * FROM users WHERE username = ?', [username])
        .then((row: any) => {
            if(row) {
                res.status(409).json('conflict');
            }
            else {
                bcrypt.hash(password, 10, (error: Error, hash: string) => {
                    if (error) throw error;
                    generateId('users').then((id: string) => {
                        dbQuery('INSERT INTO users (id, username, local) VALUES (?, ?, ?)', [id, username, hash])
                            .then(() => {
                                res.status(201).json('created');
                            });
                    });
                });
            }
    });
});

app.post('/login', passport.authenticate('local'), (req: express.Request, res: express.Response) => {
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

app.post('/unregister', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        const username = req.body.username;
        const password = req.body.password;
        dbQueryOne('SELECT * FROM users WHERE username = ?', [username])
            .then((row: any) => {
                if(row) {
                    bcrypt.compare(password, row.local, (error: Error, result: boolean) => {
                        if (error) throw error;
                        if (result === true)
                        {
                            dbQuery('DELETE FROM users WHERE username = ?', [username])
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

app.post('/author', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        checkAuthorLimitReached(req.user?.id).then((result: boolean) => {
            if(result) {
                res.status(409).json('conflict');
            }
            else {
                generateId('authors').then((id: string) => {
                    const display = req.body.display;
                    const user = req.user?.id;
                    dbQuery('INSERT INTO authors (id, display, user) VALUES (?, ?, ?)', [id, display, user])
                        .then(() => {
                            res.status(201).json('created');
                        });
                });
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/pack', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('packs').then((id: string) => {
            const display = req.body.display;
            const author = req.body.id;
            const pack = req.body.pack;
            dbQuery('INSERT INTO packs (id, display, author, pack) VALUES (?, ?, ?, ?)', [id, display, author, pack])
                .then(() => {
                    res.status(201).json('created');
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/area', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('areas').then((id: string) => {
            const display = req.body.display;
            const pack = req.body.pack;
            const area = req.body.area;
            dbQuery('INSERT INTO areas (id, display, pack, area) VALUES (?, ?, ?, ?)', [id, display, pack, area])
                .then(() => {
                    res.status(201).json('created');
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/article', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('articles').then((id: string) => {
            const display = req.body.display;
            const pack = req.body.pack;
            dbQuery('INSERT INTO articles (id, display, pack) VALUES (?, ?, ?)', [id, display, pack])
                .then(() => {
                    s3Create(`articles/${id}.md`, req.body.body)
                        .then((result: boolean) => {
                            if(result) {
                                res.status(201).json('created');
                            }
                            else {
                                res.status(500).json('internal');
                            }
                        });
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/invite', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        const guild = req.body.guild;
        const character = req.body.character;
        checkCharacterIsGuildOwner(guild, character).then((result: boolean) => {
            if(result) {
                generateId('invites').then((id: string) => {
                    const targetCharacter = req.body.targetCharacter;
                    dbQuery('INSERT INTO invites (id, holder, guild) VALUES (?, ?, ?)', [id, targetCharacter, guild])
                        .then(() => {
                            res.status(201).json('created');
                        });
                });
            }
            else {
                res.status(401).json('unauthorized');
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/item', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('items').then((id: string) => {
            const display = req.body.display;
            const pack = req.body.pack;
            const type = req.body.type;
            dbQuery('INSERT INTO items (id, display, pack, type) VALUES (?, ?, ?, ?)', [id, display, pack, type])
                .then(() => {
                    if(type===1||type===2)
                        s3Create(`blocks/${id}.png`, req.body.body)
                            .then((result: boolean) => {
                                if(result) {
                                    res.status(201).json('created');
                                }
                                else {
                                    res.status(500).json('internal');
                                }
                            });
                    else if(type===4||type===6)
                        s3Create(`models/${id}.obj`, req.body.body)
                            .then((result: boolean) => {
                                if(result) {
                                    res.status(201).json('created');
                                }
                                else {
                                    res.status(500).json('internal');
                                }
                            });
                    else
                        s3Create(`items/${id}.png`, req.body.body)
                            .then((result: boolean) => {
                                if(result) {
                                    res.status(201).json('created');
                                }
                                else {
                                    res.status(500).json('internal');
                                }
                            });
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/mail', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        dbQuery('SELECT * FROM invites WHERE holder = ?', [req.body.character])
            .then((rows: any) => {
                if(rows) {
                    res.json(rows);
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

app.post('/screen', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('screens').then((id: string) => {
            const pack = req.body.pack;
            dbQuery('INSERT INTO screens (id, pack) VALUES (?, ?, ?)', [id, pack])
                .then(() => {
                    s3Create(`screens/${id}.png`, req.body.body)
                        .then((result: boolean) => {
                            if(result) {
                                res.status(201).json('created');
                            }
                            else {
                                res.status(500).json('internal');
                            }
                        });
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/skill', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('skills').then((id: string) => {
            const display = req.body.display;
            const pack = req.body.pack;
            const skill = req.body.skill;
            dbQuery('INSERT INTO skills (id, display, pack, skill) VALUES (?, ?, ?, ?)', [id, display, pack, skill])
                .then(() => {
                    res.status(201).json('created');
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/track', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        generateId('tracks').then((id: string) => {
            const display = req.body.display;
            const pack = req.body.pack;
            dbQuery('INSERT INTO tracks (id, display, pack) VALUES (?, ?, ?)', [id, display, pack])
                .then(() => {
                    s3Create(`tracks/${id}.mp3`, req.body.body)
                        .then((result: boolean) => {
                            if(result) {
                                res.status(201).json('created');
                            }
                            else {
                                res.status(500).json('internal');
                            }
                        });
                });
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/route', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        const head = req.body.head;
        const tail = req.body.tail;
        dbQueryOne('SELECT * FROM areas WHERE id = ?', [head])
            .then((headRow: any) => {
                if(headRow) {
                    dbQueryOne('SELECT * FROM areas WHERE id = ?', [tail])
                        .then((tailRow: any) => {
                            if(tailRow) {
                                if(headRow.pack===tailRow.pack) {
                                    generateId('routes').then((id: string) => {
                                        const length = req.body.length;
                                        dbQuery('INSERT INTO routes (id, head, tail, length) VALUES (?, ?, ?, ?)', [id, head, tail, length])
                                            .then(() => {
                                                res.status(201).json('created');
                                            });
                                    });
                                }
                                else {
                                    res.status(401).json('unauthorized');
                                }
                            }
                            else {
                                res.status(404).json('notfound');
                            }
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

app.post('/character', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        checkCharacterLimitReached(req.user?.id).then((result: boolean) => {
            if(result) {
                res.status(409).json('conflict');
            }
            else {
                const display = req.body.display;
                checkCharacterNameTakenByUser(display, req.user?.id).then((result: boolean) => {
                    if(result) {
                        res.status(409).json('conflict');
                    }
                    else {
                        generateId('characters').then((id: string) => {
                            const body = req.body.body;
                            const user = req.user?.id;
                            const area = spawnpoint;
                            const balance = spawnbalance;
                            dbQuery('INSERT INTO characters (id, display, user, area, balance, body) VALUES (?, ?, ?, ?, ?, ?)', [id, display, user, area, balance, body])
                                .then(() => {
                                    res.status(201).json('created');
                                });
                        });
                    }
                });
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

app.post('/guild', (req: express.Request, res: express.Response) => {
    if(req.isAuthenticated()) {
        const character = req.body.character;
        checkCharacterAlreadyInGuild(character).then((result: boolean) => {
            if(result) {
                res.status(409).json('conflict');
            }
            else {
                generateId('guilds').then((id: string) => {
                    const display = req.body.display;
                    dbQuery('INSERT INTO guilds (id, display, holder) VALUES (?, ?, ?)', [id, display, character])
                        .then(() => {
                            dbQuery('UPDATE characters SET guild = ? WHERE id = ?', [id, character])
                                .then(() => {
                                    res.status(201).json('created');
                                });
                        });
                });
            }
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});

ws.on('connection', (socket: WebSocket) => {
    console.log('socket connected');
    socket.on('message', (message) => {
        console.log(message.toString());
        if (message.toString() === 'ping') {
            socket.send('pong');
        }
    });
});

server.listen(process.env.PORT,()=>console.log(`Server Start Successful. Database Name: ${process.env.DATABASE_NAME}`));

function capitalizeFirstLetter(string: String) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function xpToLevel(xp:any){
	return Math.floor(Math.sqrt(xp/125))
}
function sumSkills(skills:any){
	if(skills) return skills.reduce((accumulator:any,currentValue:any)=>accumulator+currentValue[1],0)
    else return 0;
}
function sumStringSkills(skills:any){
    if(!skills) return 0;
    var counter = 0;
    skills.forEach((skill:any) => {
        if(skill.constructor === String) counter++;
    }
    );
    return counter;
}
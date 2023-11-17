"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
//import sqlite3 from 'sqlite3';
const cors_1 = __importDefault(require("cors"));
//import fs from 'fs';
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = require("passport-local");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_session_1 = __importDefault(require("express-session"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = __importDefault(require("ws"));
const http_1 = __importDefault(require("http"));
const mariadb_1 = __importDefault(require("mariadb"));
const client_s3_1 = __importStar(require("@aws-sdk/client-s3"));
require("dotenv/config");
const spawnpoint = '000000000000';
const spawnbalance = 1000;
const maxCharactersPerUser = 3;
const maxAuthorsPerUser = 3;
//const localDb = new sqlite3.Database('../database/daimon.db');
const database = mariadb_1.default.createPool({
    host: process.env.DATABASE_ENDPOINT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
});
database.getConnection();
const s3 = new client_s3_1.S3Client({
    region: process.env.S3_REGION
});
const generateId = (table) => {
    return new Promise((resolve) => {
        const id = crypto_1.default.randomBytes(6).toString('hex');
        checkId(id, table).then((result) => {
            if (result)
                generateId(table);
            else
                resolve(id);
        });
    });
};
// questa funzione controlla se esiste una risorsa con quell'id e quella tabella
const checkId = (id, table) => {
    return new Promise((resolve) => {
        dbQueryOne(`SELECT * FROM ${table} WHERE id = ?`, [id])
            .then((row) => {
            if (row)
                resolve(true);
            else
                resolve(false);
        });
    });
};
// questa funzione controlla se l'utente ha già superato il limite di personaggi
const checkCharacterLimitReached = (user) => {
    return new Promise((resolve) => {
        dbQuery('SELECT * FROM characters WHERE user = ?', [user])
            .then((rows) => {
            if (rows && rows.length > maxCharactersPerUser)
                resolve(true);
            else
                resolve(false);
        });
    });
};
const checkAuthorLimitReached = (user) => {
    return new Promise((resolve) => {
        dbQuery('SELECT * FROM authors WHERE user = ?', [user])
            .then((rows) => {
            if (rows && rows.length > maxAuthorsPerUser)
                resolve(true);
            else
                resolve(false);
        });
    });
};
// questa funzione controlla se l'utente ha già un personaggio con quel nome
const checkCharacterNameTakenByUser = (user, name) => {
    return new Promise((resolve) => {
        dbQueryOne('SELECT * FROM characters WHERE user = ? AND name = ?', [user, name])
            .then((row) => {
            if (row) {
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    });
};
// questa funzione controlla se il character ha una guild
const checkCharacterAlreadyInGuild = (character) => {
    return new Promise((resolve) => {
        dbQueryOne('SELECT guild FROM characters WHERE id = ?', [character])
            .then((row) => {
            if (row) {
                if (row.guild) {
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
    });
};
const checkCharacterIsGuildOwner = (guild, character) => {
    return new Promise((resolve) => {
        dbQueryOne('SELECT * FROM guilds WHERE id = ? AND holder = ?', [guild, character])
            .then((row) => {
            if (row) {
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    });
};
const getCharacterOwner = (character) => {
    return new Promise((resolve) => {
        dbQueryOne('SELECT * FROM characters WHERE id = ?', [character])
            .then((row) => {
            if (row) {
                resolve(row.user);
            }
            else {
                resolve(null);
            }
        });
    });
};
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
const dbQuery = (sql, params) => {
    return new Promise((resolve) => {
        database.query(sql, params)
            .then((rows) => {
            if (rows) {
                resolve(rows);
            }
            else {
                resolve(null);
            }
        })
            .catch((err) => {
            console.log(err);
            resolve(null);
        });
    });
};
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
const dbQueryOne = (sql, params) => {
    return new Promise((resolve) => {
        database.query(sql, params)
            .then((rows) => {
            if (rows) {
                resolve(rows[0]);
            }
            else {
                resolve(null);
            }
        })
            .catch((err) => {
            console.log(err);
            resolve(null);
        });
    });
};
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
const s3Query = (path) => {
    return new Promise((resolve) => {
        s3.send(new client_s3_1.default.GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path
        }))
            .then((data) => {
            resolve(data.Body);
        })
            .catch((err) => {
            console.log(err);
            resolve(null);
        });
    });
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
const s3Create = (path, body) => {
    return new Promise((resolve) => {
        s3.send(new client_s3_1.default.PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path,
            Body: body
        }))
            .then(() => {
            resolve(true);
        })
            .catch((err) => {
            console.log(err);
            resolve(false);
        });
    });
};
passport_1.default.serializeUser((user, done) => done(null, user.id));
passport_1.default.deserializeUser((id, done) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield dbQueryOne('SELECT * FROM users WHERE id = ?', [id]);
    done(null, user);
}));
passport_1.default.use(new passport_local_1.Strategy((username, password, done) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield dbQueryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user)
        return done(null, false);
    if (!user.local)
        return done(null, false);
    else
        bcryptjs_1.default.compare(password, user.local, (error, result) => {
            if (error)
                throw error;
            if (result === true) {
                delete user.local;
                return done(null, user);
            }
            else
                return done(null, false);
        });
})));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: ['http://localhost:4000', 'https://projectdaimon.com'], credentials: true }));
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'daimon',
    resave: true,
    saveUninitialized: true
}));
app.use((0, cookie_parser_1.default)('daimon'));
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({
    extended: true
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
const server = http_1.default.createServer(app);
const ws = new ws_1.default.Server({ server });
app.get('/', (req, res) => {
    console.log('ping!');
    res.send('daimon api');
});
app.get('/event', (req, res) => {
    dbQueryOne('SELECT * FROM events ORDER BY "ind" DESC', [])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/user', (req, res) => {
    res.json(req.user);
});
app.get('/area/:id', (req, res) => {
    dbQueryOne('SELECT * FROM areas WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/article/:id', (req, res) => {
    dbQueryOne('SELECT * FROM articles WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            s3Query(`articles/${row.id}.md`)
                .then((data) => {
                if (data) {
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
app.get('/authors', (req, res) => {
    dbQuery('SELECT * FROM authors', [])
        .then((rows) => {
        if (rows) {
            res.json(rows);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/author/:id', (req, res) => {
    dbQueryOne('SELECT * FROM authors WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/cancreateauthor', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthorLimitReached((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((result) => {
            if (result) {
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
app.get('/cancreatecharacter', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkCharacterLimitReached((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((result) => {
            if (result) {
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
app.get('/characters', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        dbQuery('SELECT * FROM characters WHERE user = ?', [(_a = req.user) === null || _a === void 0 ? void 0 : _a.id])
            .then((rows) => {
            if (rows) {
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
app.get('/character/:id', (req, res) => {
    dbQueryOne('SELECT * FROM characters WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/cosmetic/:type', (req, res) => {
    dbQuery('SELECT * FROM cosmetics WHERE type = ?', [req.params.type])
        .then((rows) => {
        if (rows) {
            res.json(rows);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/guild/:id', (req, res) => {
    dbQueryOne('SELECT * FROM guilds WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/invite/:id', (req, res) => {
    dbQueryOne('SELECT * FROM invites WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/item/:id', (req, res) => {
    dbQueryOne('SELECT * FROM items WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            if (row.type === 3)
                res.json(row);
            if (row.type === 1 || row.type === 2)
                s3Query(`blocks/${row.id}.png`)
                    .then((data) => {
                    if (data) {
                        row.body = data;
                        res.json(row);
                    }
                    else {
                        res.status(404).json('notfound');
                    }
                });
            else if (row.type === 4 || row.type === 6)
                s3Query(`models/${row.id}.obj`)
                    .then((data) => {
                    if (data) {
                        row.body = data;
                        res.json(row);
                    }
                    else {
                        res.status(404).json('notfound');
                    }
                });
            else
                s3Query(`items/${row.id}.png`)
                    .then((data) => {
                    if (data) {
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
app.get('/pack/:id', (req, res) => {
    dbQueryOne('SELECT * FROM packs WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/route/:id', (req, res) => {
    dbQueryOne('SELECT * FROM routes WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/screen/:id', (req, res) => {
    dbQueryOne('SELECT * FROM screens WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            s3Query(`screens/${row.id}.png`)
                .then((data) => {
                if (data) {
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
app.get('/skills', (req, res) => {
    dbQuery('SELECT * FROM skills', [])
        .then((rows) => {
        if (rows) {
            res.json(rows);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/skill/:id', (req, res) => {
    dbQueryOne('SELECT * FROM skills WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('/track/:id', (req, res) => {
    dbQueryOne('SELECT * FROM tracks WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            s3Query(`tracks/${row.id}.mp3`)
                .then((data) => {
                if (data) {
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
app.get('/user/:id', (req, res) => {
    dbQueryOne('SELECT * FROM users WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            delete row.local;
            res.json(row);
        }
        else {
            res.status(404).json('notfound');
        }
    });
});
app.get('*', (req, res) => res.status(404).json('notfound'));
app.post('/register', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    dbQueryOne('SELECT * FROM users WHERE username = ?', [username])
        .then((row) => {
        if (row) {
            res.status(409).json('conflict');
        }
        else {
            bcryptjs_1.default.hash(password, 10, (error, hash) => {
                if (error)
                    throw error;
                generateId('users').then((id) => {
                    dbQuery('INSERT INTO users (id, username, local) VALUES (?, ?, ?)', [id, username, hash])
                        .then(() => {
                        res.status(201).json('created');
                    });
                });
            });
        }
    });
});
app.post('/login', passport_1.default.authenticate('local'), (req, res) => {
    res.status(200).json('success');
});
app.post('/logout', (req, res) => {
    if (req.isAuthenticated()) {
        req.logout(() => {
            res.status(200).json('success');
        });
    }
    else {
        res.status(401).json('unauthorized');
    }
});
app.post('/unregister', (req, res) => {
    if (req.isAuthenticated()) {
        const username = req.body.username;
        const password = req.body.password;
        dbQueryOne('SELECT * FROM users WHERE username = ?', [username])
            .then((row) => {
            if (row) {
                bcryptjs_1.default.compare(password, row.local, (error, result) => {
                    if (error)
                        throw error;
                    if (result === true) {
                        dbQuery('DELETE FROM users WHERE username = ?', [username])
                            .then(() => {
                            res.status(200).json('success');
                        });
                    }
                    else
                        res.status(401).json('unauthorized');
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
app.post('/author', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthorLimitReached((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((result) => {
            if (result) {
                res.status(409).json('conflict');
            }
            else {
                generateId('authors').then((id) => {
                    var _a;
                    const display = req.body.display;
                    const user = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
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
app.post('/pack', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('packs').then((id) => {
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
app.post('/area', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('areas').then((id) => {
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
app.post('/article', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('articles').then((id) => {
            const display = req.body.display;
            const pack = req.body.pack;
            dbQuery('INSERT INTO articles (id, display, pack) VALUES (?, ?, ?)', [id, display, pack])
                .then(() => {
                s3Create(`articles/${id}.md`, req.body.body)
                    .then((result) => {
                    if (result) {
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
app.post('/invite', (req, res) => {
    if (req.isAuthenticated()) {
        const guild = req.body.guild;
        const character = req.body.character;
        checkCharacterIsGuildOwner(guild, character).then((result) => {
            if (result) {
                generateId('invites').then((id) => {
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
app.post('/item', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('items').then((id) => {
            const display = req.body.display;
            const pack = req.body.pack;
            const type = req.body.type;
            dbQuery('INSERT INTO items (id, display, pack, type) VALUES (?, ?, ?, ?)', [id, display, pack, type])
                .then(() => {
                if (type === 1 || type === 2)
                    s3Create(`blocks/${id}.png`, req.body.body)
                        .then((result) => {
                        if (result) {
                            res.status(201).json('created');
                        }
                        else {
                            res.status(500).json('internal');
                        }
                    });
                else if (type === 4 || type === 6)
                    s3Create(`models/${id}.obj`, req.body.body)
                        .then((result) => {
                        if (result) {
                            res.status(201).json('created');
                        }
                        else {
                            res.status(500).json('internal');
                        }
                    });
                else
                    s3Create(`items/${id}.png`, req.body.body)
                        .then((result) => {
                        if (result) {
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
app.post('/mail', (req, res) => {
    if (req.isAuthenticated()) {
        dbQuery('SELECT * FROM invites WHERE holder = ?', [req.body.character])
            .then((rows) => {
            if (rows) {
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
app.post('/screen', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('screens').then((id) => {
            const pack = req.body.pack;
            dbQuery('INSERT INTO screens (id, pack) VALUES (?, ?, ?)', [id, pack])
                .then(() => {
                s3Create(`screens/${id}.png`, req.body.body)
                    .then((result) => {
                    if (result) {
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
app.post('/skill', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('skills').then((id) => {
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
app.post('/track', (req, res) => {
    if (req.isAuthenticated()) {
        generateId('tracks').then((id) => {
            const display = req.body.display;
            const pack = req.body.pack;
            dbQuery('INSERT INTO tracks (id, display, pack) VALUES (?, ?, ?)', [id, display, pack])
                .then(() => {
                s3Create(`tracks/${id}.mp3`, req.body.body)
                    .then((result) => {
                    if (result) {
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
app.post('/route', (req, res) => {
    if (req.isAuthenticated()) {
        const head = req.body.head;
        const tail = req.body.tail;
        dbQueryOne('SELECT * FROM areas WHERE id = ?', [head])
            .then((headRow) => {
            if (headRow) {
                dbQueryOne('SELECT * FROM areas WHERE id = ?', [tail])
                    .then((tailRow) => {
                    if (tailRow) {
                        if (headRow.pack === tailRow.pack) {
                            generateId('routes').then((id) => {
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
app.post('/character', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkCharacterLimitReached((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((result) => {
            var _a;
            if (result) {
                res.status(409).json('conflict');
            }
            else {
                const display = req.body.display;
                checkCharacterNameTakenByUser(display, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((result) => {
                    if (result) {
                        res.status(409).json('conflict');
                    }
                    else {
                        generateId('characters').then((id) => {
                            var _a;
                            const body = req.body.body;
                            const user = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
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
app.post('/guild', (req, res) => {
    if (req.isAuthenticated()) {
        const character = req.body.character;
        checkCharacterAlreadyInGuild(character).then((result) => {
            if (result) {
                res.status(409).json('conflict');
            }
            else {
                generateId('guilds').then((id) => {
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
ws.on('connection', (socket) => {
    console.log('socket connected');
    socket.on('message', (message) => {
        console.log(message.toString());
        if (message.toString() === 'ping') {
            socket.send('pong');
        }
    });
});
server.listen(process.env.PORT, () => console.log(`Server Start Successful.`));
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
function xpToLevel(xp) {
    return Math.floor(Math.sqrt(xp / 125));
}
function sumSkills(skills) {
    if (skills)
        return skills.reduce((accumulator, currentValue) => accumulator + currentValue[1], 0);
    else
        return 0;
}
function sumStringSkills(skills) {
    if (!skills)
        return 0;
    var counter = 0;
    skills.forEach((skill) => {
        if (skill.constructor === String)
            counter++;
    });
    return counter;
}

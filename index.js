"use strict";
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
const sqlite3_1 = __importDefault(require("sqlite3"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = require("passport-local");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_session_1 = __importDefault(require("express-session"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto_1 = __importDefault(require("crypto"));
const spawnpoint = '000000000000';
const database = new sqlite3_1.default.Database('../database/daimon.db');
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
        database.get(`SELECT * FROM ${table} WHERE id = ?`, [id], (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                if (row)
                    resolve(true);
                else
                    resolve(false);
            }
        });
    });
};
// questa funzione controlla se l'utente ha un author
const checkAuthor = (user) => {
    return new Promise((resolve) => {
        database.get('SELECT * FROM authors WHERE user = ?', [user], (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                if (row)
                    resolve(row);
                else
                    resolve(false);
            }
        });
    });
};
// questa funzione controlla se l'utente ha un character
const checkCharacter = (user) => {
    return new Promise((resolve) => {
        database.get('SELECT * FROM characters WHERE user = ?', [user], (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                if (row)
                    resolve(row);
                else
                    resolve(false);
            }
        });
    });
};
// questa funzione controlla se il character ha una guild
const checkGuild = (character) => {
    return new Promise((resolve) => {
        database.get('SELECT * FROM guilds WHERE character = ?', [character], (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                if (row)
                    resolve(row);
                else
                    resolve(false);
            }
        });
    });
};
// questa funzione controlla se esiste un pack con quell'id e quell'autore
const checkPack = (id, author) => {
    return new Promise((resolve) => {
        database.get('SELECT * FROM packs WHERE id = ? AND author = ?', [id, author], (err, row) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                if (row)
                    resolve(true);
                else
                    resolve(false);
            }
        });
    });
};
const dbQuery = (sql, params) => {
    return new Promise((resolve) => {
        database.all(sql, params, (err, rows) => {
            if (err) {
                console.log(err);
                resolve(null);
            }
            else {
                resolve(rows);
            }
        });
    });
};
const dbQueryOne = (sql, params) => {
    return new Promise((resolve) => {
        database.get(sql, params, (err, row) => {
            if (err) {
                console.log(err);
                resolve(null);
            }
            else {
                resolve(row);
            }
        });
    });
};
const s3Query = (path) => {
    const root = '../database/bucket/';
    return new Promise((resolve) => {
        fs_1.default.readFile(root + path, (err, data) => {
            if (err) {
                console.log(err);
                resolve(null);
            }
            else {
                resolve(data);
            }
        });
    });
};
const s3Create = (path, body) => {
    const root = '../database/bucket/';
    return new Promise((resolve) => {
        fs_1.default.writeFile(root + path, body, (err) => {
            if (err) {
                console.log(err);
                resolve(false);
            }
            else {
                resolve(true);
            }
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
app.use((0, cors_1.default)({ origin: 'http://localhost:4000', credentials: true }));
app.use((0, express_session_1.default)({
    secret: 'daimon',
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
app.get('/', (req, res) => {
    console.log('ping!');
    res.send('daimon api');
});
app.get('/event', (req, res) => {
    dbQueryOne('SELECT * FROM events ORDER BY "index" DESC', [])
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
app.get('/item/:id', (req, res) => {
    console.log(`requested item ${req.params.id}`);
    dbQueryOne('SELECT * FROM items WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            if (row.render === 'block')
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
            else if (row.render === 'model')
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
app.get('/quest/:id', (req, res) => {
    dbQueryOne('SELECT * FROM quests WHERE id = ?', [req.params.id])
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
app.get('/server/:id', (req, res) => {
    dbQueryOne('SELECT * FROM servers WHERE id = ?', [req.params.id])
        .then((row) => {
        if (row) {
            res.json(row);
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
    req.logout(() => {
        res.status(200).json('success');
    });
});
app.post('/unregister', (req, res) => {
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
});
app.post('/author', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
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
});
app.post('/pack', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                if (pack) {
                    checkPack(pack, row.id).then((result) => {
                        if (!result) {
                            res.status(401).json('unauthorized');
                            return;
                        }
                    });
                }
                generateId('packs').then((id) => {
                    const display = req.body.display;
                    const author = row.id;
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
    }
    else {
        res.status(401).json('unauthorized');
    }
});
app.post('/area', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('areas').then((id) => {
                            const display = req.body.display;
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
app.post('/article', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('articles').then((id) => {
                            const display = req.body.display;
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
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('items').then((id) => {
                            const display = req.body.display;
                            const render = req.body.render;
                            dbQuery('INSERT INTO items (id, display, pack, render) VALUES (?, ?, ?, ?)', [id, display, pack, render])
                                .then(() => {
                                if (render === 'block')
                                    s3Create(`blocks/${id}.png`, req.body.body)
                                        .then((result) => {
                                        if (result) {
                                            res.status(201).json('created');
                                        }
                                        else {
                                            res.status(500).json('internal');
                                        }
                                    });
                                else if (render === 'model')
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
app.post('/screen', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('screens').then((id) => {
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
app.post('/skill', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('skills').then((id) => {
                            const display = req.body.display;
                            const skill = req.body.skill;
                            dbQuery('INSERT INTO skills (id, pack) VALUES (?, ?)', [id, pack])
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
    }
    else {
        res.status(401).json('unauthorized');
    }
});
app.post('/track', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                const pack = req.body.pack;
                checkPack(pack, row.id).then((result) => {
                    if (result) {
                        generateId('tracks').then((id) => {
                            const display = req.body.display;
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
app.post('/route', (req, res) => {
    if (req.isAuthenticated()) {
        const head = req.body.head;
        const tail = req.body.tail;
        dbQueryOne('SELECT * FROM areas WHERE id = ?', [head])
            .then((headRow) => {
            var _a;
            if (headRow) {
                checkAuthor((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
                    if (row) {
                        checkPack(headRow.pack, row.id).then((result) => {
                            if (!result) {
                                res.status(401).json('unauthorized');
                                return;
                            }
                        });
                    }
                    else {
                        res.status(401).json('unauthorized');
                        return;
                    }
                });
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
        checkCharacter((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((row) => {
            if (row) {
                res.status(409).json('conflict');
            }
            else {
                generateId('characters').then((id) => {
                    var _a;
                    const display = req.body.display;
                    const user = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    const area = spawnpoint;
                    dbQuery('INSERT INTO characters (id, display, user, area) VALUES (?, ?, ?, ?)', [id, display, user, area])
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
app.post('/guild', (req, res) => {
    var _a;
    if (req.isAuthenticated()) {
        checkCharacter((_a = req.user) === null || _a === void 0 ? void 0 : _a.id).then((characterRow) => {
            if (characterRow) {
                checkGuild(characterRow.id).then((row) => {
                    if (row) {
                        res.status(409).json('conflict');
                    }
                    else {
                        generateId('guilds').then((id) => {
                            const display = req.body.display;
                            const character = characterRow.id;
                            const guild = characterRow.guild;
                            dbQuery('INSERT INTO guilds (id, display, character, guild) VALUES (?, ?, ?, ?)', [id, display, character, guild])
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
    }
    else {
        res.status(401).json('unauthorized');
    }
});
app.listen(3000, () => console.log(`Server Start Successful.`));
// per ogni user, un solo author può essere creato (DONE)
// per ogni author, un infinito numero di pack può essere creato (DONE)
// ogni area, article, item, screen, skill, track può appartenere a un solo pack (DONE)
// per ogni user, un solo character può essere creato (DONE)
// per ogni character, un solo guild può essere creato (DONE)
// ogni route può correre solo tra due aree appartenenti allo stesso pack
// quest, server e raid/dungeon sono rimandati

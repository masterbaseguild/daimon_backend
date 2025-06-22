// local vault access

//import sqlite3 from 'sqlite3';
//import fs from 'fs';
//const localDb = new sqlite3.Database('../database/daimon.db');

/*

const localDbQuery = (sql: string, params: string[]) => {
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
};

*/

// game constants and functions

/* 

const spawnpoint = '000000000000'
const spawnbalance = 1000
const maxCharactersPerUser = 3
const maxAuthorsPerUser = 3

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

*/

// legacy routes

/*

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

app.get('/players', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM asc_players', [])
        .then((rows: any) => {
            if(rows) {
                res.json(rows);
            }
            else {
                res.status(404).json('notfound');
            }
        });
}
);

app.get('/teams', (req: express.Request, res: express.Response) => {
    dbQuery('SELECT * FROM asc_teams', [])
        .then((rows: any) => {
            if(rows) {
                res.json(rows);
            }
            else {
                res.status(404).json('notfound');
            }
        });
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

*/

// (wip) websocket

/*

import WebSocket from 'ws';
const ws = new WebSocket.Server({ server });

ws.on('connection', (socket: WebSocket) => {
    console.log('socket connected');
    socket.on('message', (message) => {
        console.log(message.toString());
        if (message.toString() === 'ping') {
            socket.send('pong');
        }
    });
});

*/

/* async function fetchYouTubeVideos () {
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const apiKey = process.env.YOUTUBE_API_KEY;
    const url = "https://www.googleapis.com/youtube/v3/search";
    const params = {
        part: "snippet",
        channelId: channelId,
        key: apiKey,
        maxResults: 80,
        order: "date",
        pageToken: "CDIQAA"
    };
    const response = await axios.get(url, {params});
    return response.data.items;
}

function convertToFeed (id: string, item: any) {
    //convert timestamp "2024-07-25T17:00:12Z" to mariadb timestamp
    const newTimestamp = item.snippet.publishedAt.replace("T", " ").replace("Z", "");
    return {
        id: id,
        timestamp: newTimestamp,
        display: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        description: item.snippet.description,
        youtube_video: "https://www.youtube.com/watch?v="+item.id.videoId
    };
}

app.get("/fetchfeed", async (req: express.Request, res: express.Response) => {
    const videos = await fetchYouTubeVideos();
    //generate ids
    const ids = [];
    for(let i = 0; i < videos.length; i++) {
        ids.push(await generateId("feed"));
    }
    //convert to feed
    const feed = [];
    for(let i = 0; i < videos.length; i++) {
        feed.push(convertToFeed(ids[i], videos[i]));
    }
    //insert into database
    for(let i = 0; i < feed.length; i++) {
        const item = feed[i];
        dbQuery("INSERT INTO feed (id, timestamp, display, thumbnail, description, youtube_video) VALUES (?, ?, ?, ?, ?, ?)", [item.id, item.timestamp, item.display, item.thumbnail, item.description, item.youtube_video]);
    }
    res.json(feed);

function capitalizeFirstLetter(string: String) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
}); */
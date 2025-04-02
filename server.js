const { program } = require('commander');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const superagent = require('superagent'); 

program
    .requiredOption('-h, --host <host>', 'Host address')
    .requiredOption('-p, --port <port>', 'Port number')
    .requiredOption('-c, --cache <path>', 'Cache directory path')
    .parse(process.argv);

const options = program.opts();
const cacheDir = options.cache;

const server = http.createServer((req, res) => {
    const code = req.url.split('/')[1];
    const method = req.method.toUpperCase();

    if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Missing HTTP code');
        return;
    }

    if (!['GET', 'PUT', 'DELETE'].includes(method)) {
        res.writeHead(405);
        res.end();
        return;
    }

    const filePath = path.join(cacheDir, `${code}.jpg`);
    console.log(`${method} request for file: ${filePath}`);

    if (method === 'GET') {
        handleGetRequest(filePath, code, res);
    } else if (method === 'PUT') {
        handlePutRequest(req, filePath, res);
    } else if (method === 'DELETE') {
        handleDeleteRequest(filePath, res);
    }
});

async function handleGetRequest(filePath, code, res) {
    console.log(`GET request for file: ${filePath}`);

    try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            console.error('Error: Tried to read a directory instead of a file');
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Expected a file, but found a directory');
            return;
        }

        const data = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(data);

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`File not found in cache. Fetching from http.cat...`);
            fetchFromHttpCat(code, filePath, res);
        } else {
            console.error(`Error reading file: ${err.message}`);
            res.writeHead(500);
            res.end();
        }
    }
}

async function fetchFromHttpCat(code, filePath, res) {
    try {
        const response = await superagent.get(`https://http.cat/${code}`);
        
        if (response.status === 200) {
            const data = response.body; 
            await fs.writeFile(filePath, data); 
            console.log(`Image for HTTP code ${code} saved to cache.`);
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(data);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    } catch (err) {
        console.error(`Error fetching image from http.cat: ${err.message}`);
        res.writeHead(404);
        res.end('Not Found');
    }
}

async function handlePutRequest(req, filePath, res) {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));

    req.on('end', async () => {
        try {
            const data = Buffer.concat(chunks);
            await fs.writeFile(filePath, data);
            console.log(`File saved: ${filePath}`);
            res.writeHead(201, { 'Content-Type': 'text/plain' });
            res.end('Created');
        } catch (err) {
            console.error(`Error writing file: ${err.message}`);
            res.writeHead(500);
            res.end();
        }
    });

    req.on('error', () => {
        res.writeHead(500);
        res.end();
    });
}

async function handleDeleteRequest(filePath, res) {
    try {
        await fs.unlink(filePath);
        res.writeHead(200);
        res.end();
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404);
        } else {
            res.writeHead(500);
        }
        res.end();
    }
}

async function startServer() {
    try {
        await fs.access(cacheDir);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fs.mkdir(cacheDir, { recursive: true });
        } else {
            throw err;
        }
    }

    server.listen(options.port, options.host, () => {
        console.log(`Server running at http://${options.host}:${options.port}/`);
    });
}

startServer().catch((err) => {
    console.error('Error starting server:', err.message);
    process.exit(1);
});

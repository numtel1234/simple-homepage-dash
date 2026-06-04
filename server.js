import express from 'express';
import path from 'path';
import fs from 'fs/promises';

const LISTEN_ADDR = "0.0.0.0";
const PORT = 3000;
const CHECK_INTERVAL = 1000*15;

const app = express();

const absolutePath = (internal) => path.join(import.meta.dirname, internal);

process.loadEnvFile(absolutePath(".env"));

app.use(express.json());
// Front end
app.use(express.static(absolutePath("public")));

//load providers
const providersConf = JSON.parse(await fs.readFile(absolutePath("./providers/providers.json")));

const providers = {};
const cleanupHandlers = [];

for (const i in providersConf){
    const prov = providersConf[i];
    const module = await import(absolutePath(prov.path));
    if (module[prov.func]) {
        providers[prov.name] = module[prov.func];
    }
    if (prov.cleanup && module[prov.cleanup]) {
        cleanupHandlers.push(module[prov.cleanup]);
    }
}

//load services
const servicesConf = JSON.parse(await fs.readFile(absolutePath("./config.json")));

const servicesRegistry = {};

for (const i in servicesConf){
    const cat = servicesConf[i];
    for (const j in cat) {
        const srv = cat[j];
        servicesRegistry[srv.name] = {
            ...srv,
            
        }
        delete servicesRegistry[srv.name].name
    }
}

async function checkService(service) {
    try {
        const func = providers[service.provider];
        return {
            ...(await func(service.opts)),
            timestamp: Date.now()
        };
    } catch (err) {
        console.error("Error occured when checking a service:", err);
        return {
            available: false,
            display: err.message,
            timestamp: Date.now()
        };
    }
}

const cache = {};
for (const i in servicesConf) {
    const cat = servicesConf[i];
    cache[i] = cat.map(srv => {
        return {
            name: srv.name,
            desc: srv.desc,
            href: srv.href,
            status: null
        }
    });
}

async function checkServices() {
    for (const categoryName in cache) {
        cache[categoryName] = await Promise.all(
            cache[categoryName].map(async srv => ({
                ...srv,
                status: await checkService(servicesRegistry[srv.name])
            }))
        );
    }
}

await checkServices();
setInterval(checkServices, CHECK_INTERVAL);

app.get("/api/services", async (req, res) => {
    res.json(cache);
})

app.listen(PORT, LISTEN_ADDR, () => console.log(`Server running on ${
    LISTEN_ADDR === "0.0.0.0" ? "*" : LISTEN_ADDR}:${PORT}!`)
);

async function shutdown(signal) {
    console.log(`${signal} detected, running ${cleanupHandlers.length} cleanup handler${cleanupHandlers.length == 1 ? "" : "s"}...`);
    const start = performance.now();
    for (const func of cleanupHandlers) {
        try {
            await func();
        }
        catch (err) {
            console.error(err);
        }
    }
    const time = (performance.now() - start).toFixed(1);
    console.log(`Handling took ${time} ms, executing graceful exit...`);
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));
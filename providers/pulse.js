import { urlJoin } from "./utils.js";

class PulseClient {
    constructor(api, token) {
        if (!(api && token)) {
            throw new Error("Invalid arguments");
        }
        this.api = api;
        this.token = token;
    }

    async request(path) {
        const full = urlJoin(this.api, path)
        const start = performance.now();
        const res = await fetch(full, {
            headers: {"X-API-Token": this.token}
        });
        if (!res.ok) {
            throw new Error("API not available");
        }
        const latency = Math.round(performance.now() - start);
        return {data: (await res.json()), latency_ms: latency};
    }

    // enable raw requests to allow querying the new Pulse API, convention is to add a leading slash to the path
    async requestRaw(path) {
        const full = this.api + path;
        const start = performance.now();
        const res = await fetch(full, {
            headers: {"X-API-Token": this.token}
        });
        if (!res.ok) {
            throw new Error("API not available");
        }
        const latency = Math.round(performance.now() - start);
        return {data: (await res.json()), latency_ms: latency};
    }

    async health() {
        return await this.request("/health");
    }
}

const instances = new Map();

export async function check(options) {
    const { api, tokenEnv } = options;

    if (instances.get(api) === undefined) {
        const token = process.env[tokenEnv];

        if (!token) {
            throw new Error(
                `Environment variable '${tokenEnv}' not set`
            );
        }

        instances.set(api, new PulseClient(api, token));
    }

    try {
        const health = await instances.get(api).health();
        if (!health.data) {
            return {
                state: "offline",
                display: "No response"
            }
        }
        if (health.data.status !== "healthy") {
            return {
                state: "degraded",
                display: "Instance is not healthy"
            }
        }
    } catch (err) {
        return {
            state: "offline",
            display: err.message
        }
    }

    try {
        // break up the requests to get the old behavior due to a breaking Pulse API change
        const running = (await instances.get(api).requestRaw("/resources?type=app-container,vm,system-container&status=online&limit=100")).data.data.length;
        const stopped = (await instances.get(api).requestRaw("/resources?type=app-container,vm,system-container&status=offline&limit=100")).data.data.length;

        return {
            state: "online",
            display: `${running} running, ${stopped} stopped`
        }
    } catch (err) {
        return {
            state: "degraded",
            display: err.message
        }
    }
    
}
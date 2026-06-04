import { urlJoin, formatBytes } from "./utils.js";

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

    async health() {
        return await this.request("/health");
    }

    async stats() {
        return await this.request("/resources/stats");
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);

    const hours = Math.floor((seconds % 86400) / 3600);

    return `${days}d ${hours}h`;
}

const instances = new Map();

export async function check(options) {
    const { api, tokenEnv} = options;

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
        const res = await instances.get(api).stats();
        const stats = res.data;

        return {
            state: "online",
            display: `${stats.byStatus.running} running, ${stats.byStatus.stopped} stopped`
        }
    } catch (err) {
        return {
            state: "degraded",
            display: err.message
        }
    }
    
}
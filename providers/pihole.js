import { urlJoin, getUnixSeconds } from "./utils.js";

const SID_SAFETY_MARGIN = 10;

class PiholeClient {
    constructor(api, password) {
        if (!(api && password)) {
            throw new Error("Invalid arguments");
        }
        this.api = api;
        this.password = password;

        this.sid = null;
        this.sidExpires = 0;
        this.sidExtension = 0;
    }

    async getSid() {
        if (this.sid && getUnixSeconds() < (this.sidExpires - SID_SAFETY_MARGIN)) {
            return this.sid;
        } else {
            const res = await fetch(urlJoin(this.api, "/auth"), {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    password: this.password
                })
            });
            if (!res.ok) {
                throw new Error("API not available");
            }
            const auth = (await res.json()).session;
            if (!auth.valid) {
                throw new Error(auth.message);
            }
            this.sidExpires = getUnixSeconds() + auth.validity;
            this.sidExtension = auth.validity;
            this.sid = auth.sid;
            return this.sid;
        }
    }

    async summary() {
        const sid = await this.getSid();
        const full = urlJoin(this.api, "/stats/summary");
        const start = performance.now();

        const res = await fetch(full, {
            headers: {
                "Content-Type": "application/json",
                sid: sid
            }
        });
        if (!res.ok) {
            throw new Error("Metrics N/A");
        }
        const latency = Math.round(performance.now() - start);
        this.sidExpires = getUnixSeconds() + this.sidExtension;

        const stats = await res.json();

        return {
            ...stats,
            latency
        };
    }

    async close() {
        if (!this.sid) {
            return;
        }
        const res = await fetch(urlJoin(this.api, "/auth"), {
            method: "DELETE",
            headers: {
                sid: this.sid
            }
        })
        if (!(res.status === 204)) {
            console.error(await res.json());
        }
        this.sid = null;
        this.sidExpires = 0;
        this.sidExtension = 0;
    }
}

const instances = new Map();

export async function check(options) {
    const { health, api, passEnv } = options;

    const healthRes = await fetch(health);
    if (!healthRes.ok) {
        return {
            state: "offline",
            display: `Health: ${healthRes.status} ${healthRes.statusText}`
        }
    }

    if (instances.get(api) === undefined) {
        instances.set(api, new PiholeClient(api, process.env[passEnv]));
    }

    try {
        const stats = await instances.get(api).summary();
        return {
            state: "online",
            display: `${stats.queries.percent_blocked.toFixed(1)}% blocked`,
            metrics: [
                {
                    type: "metric",
                    label: "Queries",
                    value: stats.queries.total
                },
                {
                    type: "compareBar",
                    label: "Blocked",
                    value: stats.queries.blocked,
                    total: stats.queries.total
                },
                {
                    type: "metric",
                    label: "Clients",
                    value: stats.clients.active
                },
                {
                    type: "metric",
                    label: "Domains Blocked",
                    value: stats.gravity.domains_being_blocked
                },
                {
                    type: "metric",
                    label: "Cache Hit Rate",
                    value: `${(stats.queries.total > 0 ? ((stats.queries.cached / stats.queries.total) * 100).toFixed(1) : 0)}%`
                },
                {
                    type: "metric",
                    label: "Latency",
                    value: `${stats.latency} ms`
                }
            ]
        };
    } catch (err) {
        return {
            state: "degraded",
            display: `Health: ${healthRes.status} ${healthRes.statusText}\nAPI: ${err.message}`
        }
    }
}

export async function closeAll() {
    for (const instance of instances.values()) {
        await instance.close();
    }
}
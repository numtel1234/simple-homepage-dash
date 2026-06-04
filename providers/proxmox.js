import { urlJoin, formatBytes } from "./utils.js";

class ProxmoxClient {
    constructor(api, tokenId, tokenSecret) {
        if (!(api && tokenId && tokenSecret)) {
            throw new Error("Invalid arguments");
        }
        this.api = api;
        this.tokenId = tokenId;
        this.tokenSecret = tokenSecret;
    }

    async request(path) {
        const full = urlJoin(this.api, path)
        const start = performance.now();
        const res = await fetch(full, {
            headers: {"Authorization": `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`}
        });
        if (!res.ok) {
            throw new Error("API not available");
        }
        const latency = Math.round(performance.now() - start);
        return {data: (await res.json()).data, latency_ms: latency};
    }

    async resources() {
        return await this.request("/api2/json/cluster/resources");
    }
}

const instances = new Map();

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);

    const hours = Math.floor((seconds % 86400) / 3600);

    return `${days}d ${hours}h`;
}

export async function check(options) {
    const { api, tokenIdEnv, tokenSecretEnv } = options;
    if (instances.get(api) === undefined) {
        const tokenId = process.env[tokenIdEnv];

        const tokenSecret = process.env[tokenSecretEnv];

        if (!tokenId) {
            throw new Error(
                `Environment variable '${tokenIdEnv}' not set`
            );
        }

        if (!tokenSecret) {
            throw new Error(
                `Environment variable '${tokenSecretEnv}' not set`
            );
        }

        instances.set(api, new ProxmoxClient(api, tokenId, tokenSecret));
    }

    try {
        const resp = await instances.get(api).resources();
        const resources = resp.data;

        const nodes = resources.filter(r => r.type === "node");
        const node = nodes[0]; //assuming single-node cluster
        const cpuPercent = (node.cpu * 100).toFixed(1);
        const memPercent = ((node.mem / node.maxmem) * 100).toFixed(1);
        const diskPercent = ((node.disk / node.maxdisk) * 100).toFixed(1);

        const vms = resources.filter(r => r.type === "qemu");
        const runningVms = vms.filter(v => v.status === "running").length;
        const totalVms = vms.length;

        const lxcs = resources.filter(r => r.type === "lxc");
        const runningLxcs = lxcs.filter(c => c.status === "running").length;
        const totalLxcs = lxcs.length;

        const storages = resources.filter(r => r.type === "storage");

        const storageMetrics = [];
        for (const storage of storages) {
            storageMetrics.push({
                type: "bar",
                label: storage.storage,
                value: `${formatBytes(storage.disk)} / ${formatBytes(storage.maxdisk)}`,
                percent: storage.maxdisk > 0 ? (storage.disk / storage.maxdisk) * 100 : 0,
                thresholds: [
                    {
                        label: "healthy",
                        from: 0,
                        to: 80
                    },
                    {
                        label: "warning",
                        from: 80,
                        to: 95
                    },
                    {
                        label: "critical",
                        from: 95,
                        to: 100
                    }
                ]
            });
        }

        return {
            state: "online",

            display:
                `${runningVms} VM, ` +
                `${runningLxcs} CT running`,

            metrics: [
                {
                    type: "metric",
                    label: "VMs",
                    value: `${runningVms}/${totalVms}`
                },
                {
                    type: "metric",
                    label: "Containers",
                    value: `${runningLxcs}/${totalLxcs}`
                },
                {
                    type: "metric",
                    label: "CPU",
                    value: `${cpuPercent}%`
                },
                {
                    type: "metric",
                    label: "Memory",
                    value: `${memPercent}%`
                },
                {
                    type: "metric",
                    label: "Disk",
                    value: `${diskPercent}%`,
                },
                {
                    type: "group",
                    label: "Storage",
                    children: storageMetrics
                },
                {
                    type: "metric",
                    label: "Uptime",
                    value: formatUptime(node.uptime)
                },
                {
                    type: "metric",
                    label: "Latency",
                    value: `${resp.latency_ms} ms`
                }
            ]
        };
    } catch (err) {
        return {
            state: "degraded",
            display: err.message
        }
    }
};
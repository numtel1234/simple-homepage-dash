import mqtt from "mqtt";
import { formatBytes } from "./utils.js";

class MQTTStatsClient {
    constructor(broker, user, password, transformStats) {
        this.broker = broker;
        this.user = user;
        this.password = password;
        this.transformStats = transformStats;

        this.stats = {};
        this.client = null;
        this.err_msg = {
            state: "degraded",
            display: "Not connected yet"
        };
    }

    async connect() {
        this.client = await mqtt.connectAsync(this.broker, {
            connectTimeout: 5000,
            username: this.user,
            password: this.password
        })

        this.client.on("connect", () => {
            this.err_msg = null;
        })

        this.client.on("message", (topic, payload) => {
            this.stats[topic] = payload.toString();
        });

        this.client.on("reconnect", () => {
            this.err_msg = {
                state: "degraded",
                display: "Reconnecting..."
            };
        });

        this.client.on("offline", () => {
            this.err_msg = {
                state: "offline",
                display: "Broker offline"
            };
        });

        this.client.on("close", () => {
            this.err_msg = {
                state: "offline",
                display: "Connection closed"
            };
        });

        await this.client.subscribeAsync("$SYS/#");
        this.err_msg = null;
    }

    connected() {
        return this.client && this.client.connected;
    }

    getStats() {
        if (this.err_msg) {
            return this.err_msg;
        }
        return this.transformStats(this.stats);
    }

    async close() {
        if (!this.connected()) {
            throw new Error("Tried to close connection before connection is opened");
        }
        await this.client.endAsync()
    }
}

function mosquittoTransform(stats) {
    if (!stats["$SYS/broker/uptime"]) {
        return {
            state: "degraded",
            display: "Stats N/A"
        };
    }
    const activeClients = stats["$SYS/broker/clients/active"] ?? "N/A";

    return {
        state: "online",
        display: `${activeClients} clients`,
        metrics: [
            {
                type: "group",
                label: "Broker",
                children: [
                    {
                        type: "metric",
                        label: "Version",
                        value: stats["$SYS/broker/version"]
                    },
                    {
                        type: "metric",
                        label: "Uptime",
                        value: stats["$SYS/broker/uptime"]
                    },
                    {
                        type: "metric",
                        label: "Clients",
                        value: activeClients
                    },
                    {
                        type: "metric",
                        label: "Subscriptions",
                        value: stats["$SYS/broker/subscriptions/count"]
                    },
                    {
                        type: "metric",
                        label: "Retained Messages",
                        value: stats["$SYS/broker/retained messages/count"]
                    },
                    {
                        type: "metric",
                        label: "Broker Heap",
                        value: formatBytes(stats["$SYS/broker/heap/current"])
                    }
                ]
            },
            {
                type: "group",
                label: "Traffic",
                children: [
                    {
                        type: "metric",
                        label: "Sent",
                        value: stats["$SYS/broker/messages/sent"] + " messages"
                    },
                    {
                        type: "metric",
                        label: "received",
                        value: stats["$SYS/broker/messages/received"] + " messages"
                    }
                ]
            }
        ]
    }
}

const mosquittoInstances = new Map();

export async function checkMosquitto(options) {
    const { broker, userEnv, passEnv } = options;
    if (!mosquittoInstances.get(broker)) {
        const user = process.env[userEnv];
        const password = process.env[passEnv];
        if (!user) {
            throw new Error(`Environment variable ${userEnv} is not set`);
        }
        if (!password) {
            throw new Error(`Environment variable ${passEnv} is not set`);
        }
        mosquittoInstances.set(broker, new MQTTStatsClient(broker, user, password, mosquittoTransform));
        await mosquittoInstances.get(broker).connect();
    }
    return mosquittoInstances.get(broker).getStats();
}

export async function checkHealth(options) {
    return new Promise((resolve) => {
        const { broker, userEnv, passEnv } = options;
        const client = mqtt.connect(
            broker,
            {
                connectTimeout: 5000,
                username: process.env[userEnv],
                password: process.env[passEnv]
            }
        );

        const timeout = setTimeout(() => {
            client.end(true);

            resolve({
                state: "offline",
                display: "Connection timeout"
            });
        }, 5000);

        client.once("connect", () => {
            clearTimeout(timeout);

            client.end();

            resolve({
                state: "online",
                display: "Connected"
            });
        });

        client.once("error", (err) => {
            clearTimeout(timeout);

            client.end(true);

            resolve({
                state: "offline",
                display: err.message
            });
        });
    });
}

export async function closeAll() {
    for (const instance of mosquittoInstances.values()) {
        try {
            await instance.close();
        } catch (err) {
            console.error(err);
        }
    }
}
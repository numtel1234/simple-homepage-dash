export function urlJoin(base, ...segments) {
    let path = new URL(base).pathname;

    for (const segment of segments) {
        const parts = String(segment)
            .split("/")
            .filter(Boolean);

        for (const part of parts) {
            if (part === "." || part === "..") {
                throw new Error(`Invalid path segment: ${part}`);
            }

            path += (path.endsWith("/") ? "" : "/") +
                encodeURIComponent(part);
        }
    }

    const url = new URL(base);
    url.pathname = path;
    return url;
}

export function getUnixSeconds() {
    return Math.floor(Date.now()/1000);
}

export function formatBytes(bytes) {
    const units =
        ["B", "KiB", "MiB", "GiB", "TiB"];

    let i = 0;

    while (
        bytes >= 1024 &&
        i < units.length - 1
    ) {
        bytes /= 1024;
        i++;
    }

    return `${bytes.toFixed(1)} ${units[i]}`;
}
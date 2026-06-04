const dashboard = document.getElementById("dashboard");
const expandedCards = new Set();

function ageString(ts) {
    const seconds = Math.floor(
        (Date.now() - ts) / 1000
    );

    if (seconds < 60)
        return `Checked ${seconds}s ago`;

    if (seconds < 3600)
        return `Checked ${Math.floor(seconds / 60)}m ago`;

    return `Checked ${Math.floor(seconds / 3600)}h ago`;
}

function parseThresholds(thresholds, value) {
    for (const th of thresholds) {
        if (th.from > th.to) {
            continue;
        }
        if (value >= th.from && value <= th.to) {
            return th.label;
        }
    }
    return null;
}

function createMetricRow(className = "metric") {
    const row = document.createElement("div");
    row.className = className;
    return row;
}

function renderBasicMetric(metric) {
    const row = createMetricRow();

    row.innerHTML = `
        <span>${metric.label}</span>
        <span>${metric.value ?? "N/A"}</span>
    `;

    return row;
}

function renderBarMetric(metric) {
    const row = createMetricRow("metric metric-bar-metric");

    const status = metric.thresholds ? parseThresholds(metric.thresholds, metric.percent) : null;

    row.innerHTML = `
        <div class="metric-info">
            <span>${metric.label}</span>
            <span>${metric.value ?? "N/A"}</span>
            <span>
                (${metric.percent != null ? metric.percent.toFixed(1) : "N/A"}%)
            </span>
        </div>

        <div class="metric-bar">
            <div
                class="metric-bar-fill${
                    status
                        ? ` metric-status-${status}`
                        : ""
                }"
                style="width: ${metric.percent ?? 0}%"
            ></div>
        </div>
    `;

    return row;
}

function renderCompareBarMetric(metric) {
    const row = createMetricRow("metric metric-bar-metric");

    const percent = metric.total ? Math.max(0, Math.min((metric.value / metric.total) * 100, 100)) : 0;

    row.innerHTML = `
        <div class="metric-info">
            <span>${metric.label}</span>
            <span>
                ${metric.value ?? "N/A"}
                /
                ${metric.total ?? "N/A"}
            </span>
            <span>
                (${percent.toFixed(1)}%)
            </span>
        </div>

        <div class="metric-compare-bar">
            <div
                class="metric-compare-bar-fill"
                style="width: ${percent}%"
            ></div>
        </div>
    `;

    return row;
}

function renderGroupMetric(metric) {
    const row = document.createElement("div");

    row.className = "metric-group";

    const title = document.createElement("div");
    title.className = "metric-group-title";
    title.textContent = metric.label;
    row.appendChild(title);

    const children = document.createElement("div");
    children.className = "metric-children";
    renderMetrics(children, metric.children ?? []);
    row.appendChild(children);

    return row;
}

const metricRenderers = {
    metric: renderBasicMetric,
    bar: renderBarMetric,
    compareBar: renderCompareBarMetric,
    group: renderGroupMetric
};

function renderMetrics(container, metrics) {
    for (const metric of metrics) {
        const renderer = metricRenderers[metric.type];

        if (!renderer) {
            console.warn(`Unknown metric type: ${metric.type}`);
            continue;
        }

        container.appendChild(renderer(metric));
    }
}

function metricsSection(metrics = []) {
    const container =
        document.createElement("div");

    container.className = "metrics";

    renderMetrics(container, metrics);

    return container;
}

function serviceCard(service) {
    const card =
        document.createElement("div");

    card.className =
        `service-card ${service.status.state}`;

    card.innerHTML = `
        <div class="service-header">
            <div>
                <h3>
                    ${
                        service.href
                        ? `
                            <a
                                href="${service.href}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                ${service.name}
                            </a>
                        `
                        : service.name
                    }
                </h3>

                <p>${service.desc}</p>
            </div>

            <div class="status-container">
                <div
                    class="updated"
                    data-timestamp="${service.status.timestamp}"
                >
                    ${ageString(
                        service.status.timestamp
                    )}
                </div>

                <div class="status">
                    ${service.status.display}
                </div>
            </div>
        </div>
    `;

    const metrics =
        service.status.metrics ?? [];

    if (metrics.length > 0) {
        card.appendChild(
            metricsSection(metrics)
        );

        card.addEventListener(
            "click",
            e => {
                if (e.target.closest("a"))
                    return;

                card.classList.toggle("expanded");

                if (card.classList.contains("expanded")) {
                    expandedCards.add(service.name);
                } else {
                    expandedCards.delete(service.name);
                }
            }
        );
    }
    if (expandedCards.has(service.name)) {
        card.classList.add("expanded");
    }

    return card;
}

function categorySection(name, services) {
    const section =
        document.createElement("section");

    section.className = "category";

    section.innerHTML = `<h2>${name}</h2>`;

    services.forEach(service => {
        section.appendChild(
            serviceCard(service)
        );
    });

    return section;
}

function render(data) {
    dashboard.replaceChildren();

    for (const [name, services]
        of Object.entries(data)) {

        dashboard.appendChild(
            categorySection(name, services)
        );
    }
}

function updateAges() {
    document
        .querySelectorAll(".updated")
        .forEach(elem => {
            elem.textContent = ageString(
                Number(elem.dataset.timestamp)
            );
        });
}

async function refresh() {
    try {
        const data =
            await fetch("/api/services")
                .then(r => r.json());

        render(data);
    }
    catch (err) {
        console.error(err);
    }
}

refresh();

setInterval(refresh, 15000);
setInterval(updateAges, 1000);
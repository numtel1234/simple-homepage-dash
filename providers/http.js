export async function check(options) {
    const response = await fetch(options.url);
    let state = "undefined";
    if (response.ok) {
        state = "online";
    } else {
        state = "offline";
    }
    return {
        state: state,
        display: `${response.status} ${response.statusText}`
    };
}
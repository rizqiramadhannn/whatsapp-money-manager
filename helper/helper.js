function formatDateTime(unixTimestamp) {
    const utcDate = new Date(unixTimestamp * 1000);

    const utc7 = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));

    const day = String(utc7.getUTCDate()).padStart(2, '0');
    const month = String(utc7.getUTCMonth() + 1).padStart(2, '0');
    const year = utc7.getUTCFullYear();

    const hours = String(utc7.getUTCHours()).padStart(2, '0');
    const minutes = String(utc7.getUTCMinutes()).padStart(2, '0');
    const seconds = String(utc7.getUTCSeconds()).padStart(2, '0');

    return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}`;
}

function capitalizeFirstLetter(string) {
    if (!string) return string;
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function getGreeting() {
    const now = new Date();
    const hours = now.getHours();

    if (hours >= 5 && hours < 12) {
        return 'Good morning';
    } else if (hours >= 12 && hours < 18) {
        return 'Good afternoon';
    } else {
        return 'Good night';
    }
}

module.exports = {
    formatDateTime,
    capitalizeFirstLetter,
    getGreeting
};  
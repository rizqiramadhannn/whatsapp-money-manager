function formatDateTime(date) {  
    const day = String(date.getDate()).padStart(2, '0');  
    const month = String(date.getMonth() + 1).padStart(2, '0');  
    const year = date.getFullYear();  
  
    const hours = String(date.getHours()).padStart(2, '0');  
    const minutes = String(date.getMinutes()).padStart(2, '0');  
    const seconds = String(date.getSeconds()).padStart(2, '0');  
  
    return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}`;  
}  
  
function capitalizeFirstLetter(string) {  
    if (!string) return string;  
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();  
}  
  
module.exports = {  
    formatDateTime,  
    capitalizeFirstLetter  
};  
class TransactionItem {
    constructor(dateTime, item, category, source, price, type) {
        this.dateTime = dateTime;
        this.item = item;
        this.category = category;
        this.source = source;
        this.price = price;
        this.type = type;
    }

    toArray() {
        return [this.dateTime, this.item, this.category, this.source, this.price];
    }
}

module.exports = TransactionItem;
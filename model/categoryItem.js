class CategoryItem {
    constructor(category, type) {
        this.category = category;
        this.type = type;
    }

    toArray() {
        return [this.category];
    }
}

module.exports = CategoryItem;
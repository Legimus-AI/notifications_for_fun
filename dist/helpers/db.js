"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteItem = exports.updateItem = exports.createItem = exports.filterItems = exports.getItem = exports.getAggregatedItems = exports.getItems = exports.getAllItems = exports.checkQueryString = exports.renameKey = exports.listInitOptions = void 0;
const utils_1 = require("./utils");
const buildSort = (sort, order) => {
    return { [sort]: order };
};
const cleanPaginationID = (result) => {
    result.docs.map((element) => delete element.id);
    return renameKey(result, 'docs', 'payload');
};
const renameKey = (object, key, newKey) => {
    const clonedObj = Object.assign({}, object);
    const targetKey = clonedObj[key];
    delete clonedObj[key];
    clonedObj[newKey] = targetKey;
    return clonedObj;
};
exports.renameKey = renameKey;
const listInitOptions = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const order = (req.query.order || 'asc');
    const sort = (req.query.sort || 'createdAt');
    const sortBy = buildSort(sort, order);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 99999;
    return {
        order,
        sort: sortBy,
        lean: true,
        page,
        limit,
    };
});
exports.listInitOptions = listInitOptions;
function checkQueryString(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const queries = {};
        for (const key in query) {
            if (query.hasOwnProperty(key)) {
                const element = query[key];
                if (key !== 'filter' && key !== 'fields' && key !== 'page') {
                    queries[key] = element;
                }
            }
        }
        try {
            if (query.filter && query.fields) {
                const data = { $or: [] };
                const array = [];
                const arrayFields = query.fields.split(',');
                arrayFields.map((item) => {
                    array.push({
                        [item]: {
                            $regex: new RegExp(query.filter, 'i'),
                        },
                    });
                });
                data.$or = array;
                return Object.assign(Object.assign({}, data), queries);
            }
            else {
                return queries;
            }
        }
        catch (err) {
            console.log(err.message);
            throw (0, utils_1.buildErrObject)(422, 'ERROR_WITH_FILTER');
        }
    });
}
exports.checkQueryString = checkQueryString;
function getAllItems(model) {
    return __awaiter(this, void 0, void 0, function* () {
        return model.find({}, '-updatedAt -createdAt', {
            sort: { name: 1 },
        });
    });
}
exports.getAllItems = getAllItems;
function getItems(req, model, query) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = yield listInitOptions(req);
        for (const key in options) {
            if (query.hasOwnProperty(key))
                delete query[key];
        }
        return new Promise((resolve, reject) => {
            model.paginate(query, options, (err, items) => {
                if (err) {
                    reject((0, utils_1.buildErrObject)(422, err.message));
                }
                resolve(cleanPaginationID(items));
            });
        });
    });
}
exports.getItems = getItems;
function getAggregatedItems(req, model, aggregated) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = yield listInitOptions(req);
        return new Promise((resolve, reject) => {
            model.aggregatePaginate(aggregated, options, (err, items) => {
                if (err) {
                    reject((0, utils_1.buildErrObject)(422, err.message));
                }
                else {
                    resolve(cleanPaginationID(items));
                }
            });
        });
    });
}
exports.getAggregatedItems = getAggregatedItems;
function getItem(id, model) {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        const item = yield model.findById(id);
        if (!item) {
            return (0, utils_1.itemNotFound)(null, item, reject, 'NOT_FOUND');
        }
        resolve(item);
    }));
}
exports.getItem = getItem;
function filterItems(fields, model) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            model.find(fields, (err, payload) => {
                if (err) {
                    reject((0, utils_1.buildErrObject)(422, err.message));
                }
                resolve({ ok: true, payload });
            });
        });
    });
}
exports.filterItems = filterItems;
function createItem(body, model) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const item = new model(body);
            const payload = yield item.save();
            return payload;
        }
        catch (err) {
            console.log('salio este error:', err);
            throw (0, utils_1.buildErrObject)(422, err.message);
        }
    });
}
exports.createItem = createItem;
function updateItem(id, model, body) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            const item = yield model.findById(id);
            if (!item) {
                return (0, utils_1.itemNotFound)(null, item, reject, 'NOT_FOUND');
            }
            item.set(body);
            try {
                resolve(yield item.save());
            }
            catch (error) {
                reject((0, utils_1.buildErrObject)(422, error.message));
            }
        }));
    });
}
exports.updateItem = updateItem;
function deleteItem(id, model) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            const item = yield model.findById(id);
            if (!item) {
                return (0, utils_1.itemNotFound)(null, item, reject, 'NOT_FOUND');
            }
            yield model.deleteOne({ _id: id });
            try {
                resolve(item);
            }
            catch (error) {
                reject((0, utils_1.buildErrObject)(422, error.message));
            }
        }));
    });
}
exports.deleteItem = deleteItem;
//# sourceMappingURL=db.js.map
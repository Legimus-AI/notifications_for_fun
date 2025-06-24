import { Request } from 'express';
import { Document } from 'mongoose';

type ModelInstance = any;
import { buildErrObject, itemNotFound } from './utils';

const buildSort = (
  sort: string,
  order: number | string,
): Record<string, number | string> => {
  return { [sort]: order };
};

const cleanPaginationID = (result: any): any => {
  result.docs.map((element: any) => delete element.id);
  return renameKey(result, 'docs', 'payload');
};

const renameKey = (
  object: Record<string, any>,
  key: string,
  newKey: string,
): Record<string, any> => {
  const clonedObj = { ...object };
  const targetKey = clonedObj[key];
  delete clonedObj[key];
  clonedObj[newKey] = targetKey;
  return clonedObj;
};

const listInitOptions = async (req: Request): Promise<Record<string, any>> => {
  const order = (req.query.order || 'asc') as string;
  const sort = (req.query.sort || 'createdAt') as string;
  const sortBy = buildSort(sort, order);
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 99999;
  return {
    order,
    sort: sortBy,
    lean: true,
    page,
    limit,
  };
};

async function checkQueryString(
  query: Record<string, any>,
): Promise<Record<string, any>> {
  const queries: Record<string, any> = {};
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
      const data: Record<string, any> = { $or: [] };
      const array: any[] = [];
      const arrayFields = query.fields.split(',');
      arrayFields.map((item) => {
        array.push({
          [item]: {
            $regex: new RegExp(query.filter, 'i'),
          },
        });
      });
      data.$or = array;
      return { ...data, ...queries };
    } else {
      return queries;
    }
  } catch (err) {
    console.log(err.message);
    throw buildErrObject(422, 'ERROR_WITH_FILTER');
  }
}

async function getAllItems(model: ModelInstance): Promise<any> {
  return model.find({}, '-updatedAt -createdAt', {
    sort: { name: 1 },
  });
}

async function getItems(
  req: Request,
  model: ModelInstance,
  query: Record<string, any>,
): Promise<any> {
  const options = await listInitOptions(req);
  for (const key in options) {
    if (query.hasOwnProperty(key)) delete query[key];
  }
  return new Promise((resolve, reject) => {
    model.paginate(query, options, (err, items) => {
      if (err) {
        reject(buildErrObject(422, err.message));
      }
      resolve(cleanPaginationID(items));
    });
  });
}

async function getAggregatedItems(
  req: Request,
  model: ModelInstance,
  aggregated: any[],
): Promise<any> {
  const options = await listInitOptions(req);
  return new Promise((resolve, reject) => {
    model.aggregatePaginate(aggregated, options, (err, items) => {
      if (err) {
        reject(buildErrObject(422, err.message));
      } else {
        resolve(cleanPaginationID(items));
      }
    });
  });
}

function getItem(id: string, model: ModelInstance): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const item = await model.findById(id);
    if (!item) {
      return itemNotFound(null, item, reject, 'NOT_FOUND');
    }
    resolve(item);
  });
}

async function filterItems(
  fields: Record<string, any>,
  model: ModelInstance,
): Promise<any> {
  return new Promise((resolve, reject) => {
    model.find(fields, (err, payload) => {
      if (err) {
        reject(buildErrObject(422, err.message));
      }
      resolve({ ok: true, payload });
    });
  });
}

async function createItem(
  body: Record<string, any>,
  model: typeof Document,
): Promise<any> {
  try {
    const item = new model(body);
    const payload = await item.save();
    return payload;
  } catch (err) {
    console.log('salio este error:', err);
    throw buildErrObject(422, err.message);
  }
}

async function updateItem(
  id: string,
  model: ModelInstance,
  body: Record<string, any>,
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const item = await model.findById(id);
    if (!item) {
      return itemNotFound(null, item, reject, 'NOT_FOUND');
    }
    item.set(body);

    try {
      resolve(await item.save());
    } catch (error) {
      reject(buildErrObject(422, error.message));
    }
  });
}

async function deleteItem(id: string, model: ModelInstance): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const item = await model.findById(id);
    if (!item) {
      return itemNotFound(null, item, reject, 'NOT_FOUND');
    }
    await model.deleteOne({ _id: id });
    try {
      resolve(item);
    } catch (error) {
      reject(buildErrObject(422, error.message));
    }
  });
}

export {
  listInitOptions,
  renameKey,
  checkQueryString,
  getAllItems,
  getItems,
  getAggregatedItems,
  getItem,
  filterItems,
  createItem,
  updateItem,
  deleteItem,
};

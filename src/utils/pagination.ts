export type PageQuery = {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
};

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type PageResult<T> = {
  items: T[];
  meta: PageMeta;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** True when the caller asked for a page — otherwise list endpoints return everything. */
export function isPagedQuery(query: PageQuery): boolean {
  return query.page != null || query.pageSize != null || query.limit != null || query.offset != null;
}

/** Honors `page`/`pageSize` and the `limit`/`offset` aliases. */
export function parsePageQuery(query: PageQuery): { page: number; pageSize: number; skip: number } {
  let pageSize = query.pageSize ?? query.limit ?? DEFAULT_PAGE_SIZE;
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));

  let page = query.page ?? DEFAULT_PAGE;
  if (query.offset != null && query.page == null) {
    page = Math.floor(Math.max(0, query.offset) / pageSize) + 1;
  }
  page = Math.max(1, page);

  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total };
}

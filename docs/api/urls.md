---
title: Streamient URL API
description: "Save, extract, list, search, update, recrawl, and delete bookmarked URLs through the Streamient API, with project-scoped request examples."
---

# URLs API

Save and manage bookmarked URLs with automatic content extraction.

## List URLs

```
GET /api/v1/urls?project_id=<id>&page=1&per_page=20
```

## Save URL

```
POST /api/v1/urls
```

```json
{
    "url": "https://example.com/article",
    "title": "Optional title override",
    "description": "Optional description",
    "crawl_enabled": false,
    "project_id": "optional-project-id"
}
```

When saved, Streamient auto-extracts the page title, description, Open Graph image, and text content using Cheerio.

If the account already has the same active URL saved, Streamient returns the existing URL with `duplicate: true` and does not create another record.

Set `crawl_enabled: true` to enable URL path crawling for static and server-rendered HTML with Crawlee. Crawled pages are re-indexed every 24 hours.

## Get URL

```
GET /api/v1/urls/:id
```

The response includes `text_content`, the plain text parsed from the saved page, and `is_indexed`, which reports whether the URL document was indexed successfully.

## Update URL

```
PUT /api/v1/urls/:id
```

```json
{
    "title": "Updated Title",
    "description": "Updated description",
    "crawl_enabled": true
}
```

Set `crawl_enabled: false` to stop URL path crawling and remove crawled pages for this URL from the pages index.

## Resync Crawled Pages

```
POST /api/v1/urls/:id/resync
```

Deletes existing crawled page documents for the URL, then starts URL path crawling in the background.

## List Crawled Pages

```
GET /api/v1/urls/:id/pages?page=1&limit=100
```

Returns one entry per indexed crawled URL. Counts and pagination exclude additional text chunks created for long pages.

## Get Crawled Page Indexed Text

```
GET /api/v1/urls/:id/pages/:pageId
```

Returns the selected crawled page and its full `text_content`, reconstructed in order from the indexed chunks. `index_complete` is `false` if one or more expected chunks are missing.

## Delete URL

```
DELETE /api/v1/urls/:id
```

## Search URLs

```
POST /api/v1/urls/search
```

```json
{
    "query": "search term"
}
```

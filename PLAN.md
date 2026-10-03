# CollabMD — Support Arbitrary Vault Files

## Goal

Change CollabMD's file model so that **every regular file in the vault is visible and manageable**, regardless of whether CollabMD knows how to preview or edit its format.

Supported formats should continue to receive specialized editors/previews. Unknown formats should appear in the file tree and open a simple **download-only file view**.

This should apply equally to:

* files uploaded through the UI;
* files copied directly into the vault;
* files created or changed externally;
* files discovered during vault scanning/reconciliation.

The key architectural distinction should become:

> **A file being present in the vault is independent from CollabMD knowing how to render/edit it.**

---

# 1. Target file model

Introduce/maintain three separate concepts:

| Concept      | Meaning                                     |
| ------------ | ------------------------------------------- |
| Vault file   | A regular file that exists inside the vault |
| File kind    | A format CollabMD recognizes                |
| Capabilities | Operations available for that file          |

For example:

### Markdown

```text
vault file: yes
kind: markdown
preview: yes
edit: yes
download: yes
comments: yes
```

### PDF

```text
vault file: yes
kind: pdf
preview: yes
edit: no
download: yes
```

### EPUB

```text
vault file: yes
kind: unknown
preview: no
edit: no
download: yes
```

### ZIP

```text
vault file: yes
kind: unknown
preview: no
edit: no
download: yes
```

The implementation should **not** add `.epub`, `.zip`, etc. to `VAULT_FILE_EXTENSIONS` merely to make them visible. Those constants represent recognized/specialized formats in the current design.

---

# 2. Domain layer: `src/domain/file-kind.js`

## Current behavior

This module currently contains the recognized extension lists:

```js
VAULT_FILE_EXTENSIONS
```

and determines the kind through:

```js
getVaultFileKind(filePath)
```

Unknown extensions return `null`.

It then derives the file-tree node type through:

```js
getVaultTreeNodeType(filePath)
```

which also returns `null` for unknown files.

Finally:

```js
isVaultFilePath(filePath)
```

currently means:

```js
return getVaultFileKind(filePath) !== null;
```

Therefore an unknown file is effectively **not considered a vault file** by this abstraction.

## Planned changes

### 2.1 Keep `getVaultFileKind()`

Do not make unknown files pretend to be a known format.

Continue returning:

```js
null
```

for an unsupported/unknown extension.

This preserves all existing specialized format behavior.

### 2.2 Change the meaning of `getVaultTreeNodeType()`

Current:

```js
getVaultTreeNodeType(path)
```

returns `null` for unknown files.

Change the behavior so an unknown regular file gets a generic node type, for example:

```js
'file'
```

or another explicit generic type such as:

```js
'unknown'
```

Recommended direction:

```js
const kind = getVaultFileKind(filePath);

if (!kind) {
    return 'file';
}
```

The exact name should be aligned with the existing frontend tree model.

Important: determine whether `file` already means specifically “Markdown file” elsewhere. The current implementation maps Markdown to `file`, so this needs to be checked before choosing the generic type.

### 2.3 Separate `isVaultFilePath()` from format recognition

The current:

```js
isVaultFilePath(path)
```

should no longer be used as:

> “Is this a recognized CollabMD format?”

It should represent:

> “Is this path eligible to represent a regular vault file?”

If path validation and filesystem checks are separate, this function may need to move out of `file-kind.js` or be replaced with a more precise predicate.

Possible resulting API:

```js
getVaultFileKind(path)
// → "markdown" | "pdf" | "image" | ... | null

getVaultTreeNodeType(path)
// → "file" | "pdf" | "image" | ... 

isRecognizedVaultFilePath(path)
// → true only for known/specialized formats

isVaultFilePath(path)
// → true for any valid regular file path
```

The exact API should be decided after tracing all consumers.

### 2.4 Add explicit capability helpers

Instead of consumers repeatedly checking file kinds, consider helpers such as:

```js
supportsPreviewForFilePath(path)
supportsEditingForFilePath(path)
supportsDownloadForFilePath(path)
supportsCommentsForFilePath(path)
supportsBacklinksForFilePath(path)
```

The existing module already has capability-style helpers:

```js
supportsCommentsForFilePath()
supportsBacklinksForFilePath()
```

so this is consistent with the existing design.

For unknown files:

```js
supportsPreview → false
supportsEditing → false
supportsComments → false
supportsBacklinks → likely false
supportsDownload → true
```

Backlinks require special consideration because the current implementation derives them from `isVaultFilePath()`. That behavior will need to be revisited once arbitrary files become valid vault files.

---

# 3. Vault scanning / filesystem discovery

## Goal

The vault scanner must discover **all regular files**, rather than only files whose extension appears in `VAULT_FILE_EXTENSIONS`.

Current behavior to locate:

```text
filesystem
   ↓
vault scanner / directory traversal
   ↓
file-kind filtering
   ↓
tree/index
```

The exact scanner module/function should be identified by searching for usages of:

```text
isVaultFilePath
getVaultFileKind
getVaultTreeNodeType
VAULT_FILE_EXTENSIONS
```

## Planned change

The filesystem traversal should fundamentally operate on:

```text
is this a regular file?
```

rather than:

```text
is this a recognized CollabMD file?
```

Conceptually:

```js
for each filesystem entry:
    if directory:
        recurse
    else if regular file:
        include it
```

Then classify afterward:

```js
const kind = getVaultFileKind(path);
```

This gives:

```text
file discovered
       ↓
    classify
       ↓
 ┌─────┴──────┐
known        unknown
 ↓              ↓
specialized   generic
```

## Important exclusions

Do not automatically expose everything returned by the filesystem.

The scanner should continue excluding things such as:

* directories from file nodes;
* invalid/path-traversal paths;
* internal metadata directories/files if the existing implementation excludes them;
* symlinks or special filesystem entries if the current security model excludes them.

The change is specifically:

> **all eligible regular vault files**, not literally every filesystem object.

## External-file behavior

After this change:

```text
copy foo.epub into vault
       ↓
filesystem watcher/reconciliation
       ↓
scanner discovers foo.epub
       ↓
getVaultFileKind() → null
       ↓
generic file node
       ↓
visible in UI
```

This is an explicit acceptance criterion.

---

# 4. Vault watcher / reconciliation

The repository has filesystem/vault reconciliation behavior, so the same distinction must be applied to incremental changes.

Locate code responsible for:

* filesystem change events;
* added files;
* deleted files;
* renamed files;
* vault refresh/reconciliation;
* workspace/vault synchronization.

Search consumers of:

```text
isVaultFilePath
getVaultFileKind
getVaultTreeNodeType
```

and any code that filters filesystem events by extension.

## Planned behavior

### New unknown file

```text
filesystem event
→ determine path
→ determine that it is a valid regular vault file
→ add/update tree
→ classify as unknown
```

### Deleted unknown file

```text
filesystem event
→ remove generic file node
```

### Renamed unknown file

```text
old unknown file
→ remove old node
→ add new node
→ reclassify
```

### Unknown → known

For example:

```text
foo.txt → foo.md
```

must change the node from generic/download-only to Markdown.

### Known → unknown

For example:

```text
foo.md → foo.epub
```

must change the node from Markdown/editor mode to generic/download-only mode.

This is an important reason not to make file type a permanent property of the tree entry.

---

# 5. Server/API representation of tree entries

Trace the API that supplies the vault/file tree to the browser.

Determine whether tree entries currently contain something like:

```js
{
    path,
    name,
    type
}
```

or whether the frontend derives type entirely from the path.

## Preferred representation

The server should ideally provide enough information for the client to distinguish:

```js
{
    path,
    name,
    type: 'file',
    kind: null
}
```

for unknown files.

For known files:

```js
{
    path,
    name,
    type: 'pdf',
    kind: 'pdf'
}
```

However, **do not introduce redundant fields unnecessarily** if the current architecture derives these values reliably from the path.

First trace the existing API contract.

## Important rule

An unknown file must not disappear simply because:

```js
kind === null
```

The absence of a specialized kind should be data, not an instruction to remove the node.

---

# 6. File-tree rendering

Locate the file-tree/sidebar components and their tree-node filtering.

Search for:

```text
getVaultTreeNodeType
```

and conditions involving:

```text
type
kind
extension
isVaultFilePath
```

## Current problem

The current domain function can return:

```js
null
```

for an unknown file's tree node type.

Any code doing:

```js
if (!node.type) {
    return null;
}
```

or equivalent filtering is likely part of why manually-created unsupported files disappear.

## Planned change

Every generic file should produce a visible node.

Example:

```text
📄 README.md
📄 notes.canvas
📕 book.epub
📦 archive.zip
📎 data.bin
```

The exact icon is a UI decision.

A generic file icon is sufficient initially.

## Tree actions

Unknown files should continue to support ordinary file operations where safe:

* open;
* download;
* rename;
* move;
* delete;
* copy path / link if applicable.

Operations that depend on semantic file content should remain disabled.

---

# 7. File opening / routing

Trace the handler invoked when a user clicks a tree node.

Likely flow:

```text
Tree node
   ↓
click/open handler
   ↓
route/state update
   ↓
selected file
   ↓
file-kind detection
   ↓
specialized viewer/editor
```

Search for uses of:

```text
getVaultFileKind
```

in the client/application-shell/preview/editor code.

## Current desired behavior

Known:

```text
click README.md
→ Markdown editor/preview
```

Unknown:

```text
click book.epub
→ generic file screen
```

## Generic file screen

Introduce a fallback viewer, conceptually:

```text
UnsupportedFileView
```

or:

```text
FileDownloadView
```

It should show:

* filename;
* path/location if appropriate;
* file type/extension if useful;
* optional size;
* download action;
* perhaps a generic icon.

It should **not attempt to parse the file**.

Example:

```text
┌────────────────────────────────────┐
│  book.epub                          │
│                                    │
│  EPUB document                     │
│  Preview is not available.         │
│                                    │
│          [ Download file ]         │
└────────────────────────────────────┘
```

---

# 8. Download endpoint / file serving

Trace the existing file-download mechanism.

The generic viewer should reuse the existing download endpoint rather than introducing a second file-serving mechanism.

Verify:

* route;
* path validation;
* MIME type handling;
* `Content-Disposition`;
* streaming vs buffering;
* authentication/authorization;
* range requests if relevant.

## MIME type

For unknown files, the server should preferably determine a reasonable MIME type from the filename when possible.

For example:

```text
.epub → application/epub+zip
.zip  → application/zip
```

But **MIME type must not be used as a security trust decision**.

For truly unknown types:

```text
application/octet-stream
```

is an appropriate fallback.

---

# 9. Upload validation

Uploading should no longer depend on recognized `FileKind`.

Current upload flow needs to be traced from:

```text
file picker / drag-drop
       ↓
client validation
       ↓
upload API
       ↓
multipart parsing
       ↓
server validation
       ↓
filesystem write
```

## Client-side validation

The browser file input currently may have an `accept` restriction.

Change it so arbitrary files can be selected.

Avoid:

```html
accept=".md,.pdf,..."
```

unless the UI has a separate optional filter.

The client should still enforce:

* selected file exists;
* filename/path validity;
* maximum size if configured;
* number of files if applicable.

Client validation is UX only.

## Server-side validation

The server must independently enforce:

* maximum upload size;
* filename/path safety;
* destination path safety;
* authorization;
* overwrite rules;
* number of files/request if relevant.

The server must **not** reject an otherwise valid file merely because:

```js
getVaultFileKind(filename) === null
```

---

# 10. Maximum file size

Introduce a configurable maximum upload size.

For example:

```text
COLLABMD_MAX_UPLOAD_SIZE
```

The exact configuration name should follow the project's existing environment/runtime configuration conventions.

Define clearly:

```text
maximum bytes per file
```

rather than relying on a vague request-body maximum.

Potential configuration:

```text
COLLABMD_MAX_UPLOAD_SIZE=50MB
```

or a byte-based value:

```text
COLLABMD_MAX_UPLOAD_SIZE_BYTES=52428800
```

Prefer whichever convention matches existing CollabMD configuration.

## Enforcement layers

Ideally:

```text
Browser
  ↓
reject immediately if known size > limit

HTTP server / multipart parser
  ↓
reject oversized request as early as possible

Upload handler
  ↓
validate individual file size

Filesystem
  ↓
write only validated content
```

The server-side limit is authoritative.

---

# 11. Multiple-file uploads

The current project has multi-file vault uploads according to the latest release notes, so this change must preserve that behavior.

Test combinations such as:

```text
notes.md
book.epub
archive.zip
image.png
document.pdf
```

in one upload.

Expected:

```text
all five files are uploaded
all five appear in the tree
Markdown → editor
PDF → PDF viewer
PNG → image viewer
EPUB → download-only
ZIP → download-only
```

---

# 12. File capabilities

Audit every place that currently assumes:

```text
vault file == recognized file kind
```

Particularly:

* editor selection;
* preview selection;
* comments;
* backlinks;
* search;
* quick switcher;
* command palette;
* file actions;
* delete/rename/move;
* collaboration;
* Git integration;
* export;
* attachment handling.

Not every feature needs to support arbitrary files.

The desired policy should be:

| Capability         | Unknown file                             |
| ------------------ | ---------------------------------------- |
| Display in tree    | Yes                                      |
| Select/open        | Yes                                      |
| Download           | Yes                                      |
| Rename             | Yes                                      |
| Move               | Yes                                      |
| Delete             | Yes                                      |
| Preview            | No                                       |
| Edit               | No                                       |
| Markdown parsing   | No                                       |
| Diagram rendering  | No                                       |
| Comments           | No                                       |
| Backlinks          | No, unless explicitly designed otherwise |
| Full-text indexing | No initially                             |
| Search by filename | Yes                                      |

The last two should be verified against existing search/index architecture rather than assumed.

---

# 13. Search and indexing

Audit any content indexing that currently uses `isVaultFilePath()`.

Unknown binary files should generally **not** be parsed as text.

For example:

```text
book.epub
archive.zip
image.png
```

should not accidentally be sent through Markdown/frontmatter parsing or text indexing.

However, filenames should remain searchable if the existing file-tree/search architecture supports filename search.

Recommended initial policy:

```text
unknown file:
    filename searchable: yes
    content searchable: no
```

A future implementation could add specialized extractors independently.

---

# 14. Preview architecture

Do not modify the existing specialized preview implementations merely to accommodate unknown files.

Instead, change the dispatcher:

```text
file kind
   │
   ├── markdown → Markdown preview/editor
   ├── html → HTML handling
   ├── pdf → PDF viewer
   ├── image → image viewer
   ├── canvas → canvas viewer
   ├── mermaid → diagram viewer
   ├── ...
   └── null → generic download-only viewer
```

This keeps unsupported formats from falling through into a parser that assumes a particular content type.

---

# 15. EPUB specifically

For the initial implementation:

```text
.epub
→ recognized as an ordinary vault file
→ visible
→ selectable
→ downloadable
→ no in-app preview
```

Do **not** add EPUB to `VAULT_FILE_EXTENSIONS`.

A later EPUB feature can add:

```js
EPUB_FILE_EXTENSION = '.epub'
```

and:

```js
getVaultFileKind('book.epub') === 'epub'
```

along with an EPUB renderer.

That future change should then require only the specialized capability path rather than another fundamental change to vault-file discovery.

---

# 16. Tests

## Domain tests

Add tests for:

```text
getVaultFileKind('book.epub') === null
```

and:

```text
getVaultTreeNodeType('book.epub') === generic file type
```

Also verify that:

```text
isVaultFilePath(...)
```

has the intended new semantics.

Test:

* `.epub`
* `.zip`
* `.docx`
* `.txt`
* no extension
* uppercase extensions
* filenames containing multiple dots
* existing supported extensions

## Vault scanning tests

Given:

```text
vault/
  README.md
  book.epub
  archive.zip
  image.png
```

expect all four to appear.

## Upload tests

Upload:

```text
README.md
book.epub
archive.zip
```

and verify all succeed.

Test:

* supported file;
* unsupported file;
* zero-byte file;
* large file;
* file exactly at limit;
* file one byte above limit;
* multiple files;
* duplicate filenames;
* invalid/path-traversal filenames.

## UI / E2E tests

Verify:

1. Unsupported file appears in sidebar.
2. Clicking it opens generic file view.
3. Generic view offers download.
4. Download produces the original file.
5. Supported files continue opening their existing viewers.
6. An externally-created unsupported file appears after reconciliation/watch update.
7. Renaming a supported file to an unsupported extension changes its UI behavior.
8. Renaming an unsupported file to a supported extension activates the specialized UI.
9. Deleting an unsupported file removes it from the tree.

---

# 17. Recommended implementation order

### Phase 1 — Understand current flow

Trace and document:

```text
filesystem scan
→ vault representation
→ tree API/state
→ tree rendering
→ file-open handler
→ preview dispatcher
→ download endpoint
→ upload endpoint
```

Search specifically for:

```text
VAULT_FILE_EXTENSIONS
getVaultFileKind
getVaultTreeNodeType
isVaultFilePath
supportsCommentsForFilePath
supportsBacklinksForFilePath
```

### Phase 2 — Decouple discovery from file-kind

Make the filesystem/tree layer accept all valid regular files.

Keep `getVaultFileKind()` returning `null` for unknown files.

Add a generic tree-node type.

### Phase 3 — Generic file UI

Add the download-only viewer/fallback.

Ensure the existing download mechanism can serve arbitrary vault files.

### Phase 4 — Upload arbitrary files

Remove recognized-extension filtering from upload validation.

Keep filename/path/security validation.

### Phase 5 — Upload size configuration

Add configurable maximum size and enforce it server-side.

### Phase 6 — Audit dependent features

Review:

* search;
* backlinks;
* comments;
* collaboration;
* export;
* file actions;
* indexing.

Ensure unknown files don't accidentally enter specialized content pipelines.

### Phase 7 — Tests

Add domain, server/integration, and Playwright/E2E coverage.

---

# 18. Desired end-to-end architecture

The final flow should look like:

```text
                         VAULT
                           │
                           ▼
                    filesystem scan
                           │
                  all valid regular files
                           │
                           ▼
                     file metadata
                           │
                 ┌─────────┴─────────┐
                 │                   │
          getVaultFileKind()    generic/unknown
                 │                   │
          recognized kind             │
                 │                   │
        ┌────────┼────────┐           │
        ▼        ▼        ▼           ▼
    Markdown    PDF     Image     Generic file
        │        │        │           │
        ▼        ▼        ▼           ▼
     editor    viewer   viewer    download-only
```

Upload follows the same model:

```text
User selects file
      │
      ▼
client size/basic validation
      │
      ▼
upload API
      │
      ├── path/security validation
      ├── size validation
      └── no FileKind restriction
      │
      ▼
write to vault
      │
      ▼
filesystem/reconciliation
      │
      ▼
file appears in tree
      │
      ▼
classify for capabilities
```

## Core design principle

**File discovery answers “does this file exist?”**

**File-kind detection answers “what does CollabMD know about this file?”**

**Capability detection answers “what can CollabMD do with it?”**

Those three questions should no longer be collapsed into one `isVaultFilePath()` check.


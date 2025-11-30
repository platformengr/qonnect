---
agent: 'agent'
description: 'Implement Excel-like table editing for TableViewerPanel webview'
---

# Excel-Like Table Editing Implementation

## Target File
`/src/adapters/vscode/TableViewerPanel.ts`

## Context
This is a VS Code extension for managing PostgreSQL databases. The `TableViewerPanel` displays table data in a webview. The TypeScript backend methods (`saveCell`, `deleteRow`, `insertRow`) already handle database operations and return `cellId`/`rowId` for tracking failed operations.

## Task
Modify the `getHtmlContent()` method (the HTML/CSS/JS portion) to create a spreadsheet-like editing experience.

## Required Features

### 1. Cell Selection & Editing
- **Single-click** on a cell selects it (highlight with border)
- **Double-click** OR **start typing** enters edit mode
- **Tab** moves to next cell (right), **Shift+Tab** moves left
- **Enter** saves current cell and moves down one row
- **Arrow keys** navigate between cells when not editing
- **Escape** cancels editing and reverts to original value

### 2. Inline Row Addition (Remove Modal)
- Remove the `#addRowModal` and "Add Row" button from toolbar
- Always show an empty "new row" at the bottom of the table
- Users can Tab into it and start typing values
- When user presses Enter or clicks away from the new row, send insert request
- After successful insert, refresh data and show another empty row
- Support tracking multiple new rows with temporary IDs like `new-row-{timestamp}`

### 3. Error State Highlighting
When operations fail, visually highlight the affected cells/rows:

- **Failed cell saves**: Add `.cell-error` class (red border/background)
- **Failed row inserts**: Add `.row-error` class (red background on entire row)
- **Failed row deletes**: Add `.row-error` class
- Error state persists until user edits the cell/row again
- Track errors using:
  - `cellId` format: `cell-{rowIndex}-{columnName}`
  - `rowId` format: `row-{rowIndex}` or `new-row-{tempId}`

### 4. Message Format Updates
When sending messages to the backend, include tracking IDs:

```javascript
// For cell saves
vscode.postMessage({
  type: 'saveCell',
  rowIndex: rowIndex,
  column: columnName,
  value: newValue,
  primaryKeys: pkData,
  cellId: `cell-${rowIndex}-${columnName}`
});

// For row inserts
vscode.postMessage({
  type: 'insertRow',
  values: rowValues,
  rowId: `new-row-${tempId}`
});

// For row deletes
vscode.postMessage({
  type: 'deleteRow',
  primaryKeys: pkData,
  rowId: `row-${rowIndex}`
});
```

### 5. Handle Error Responses
The backend sends back these messages on failure:
- `{ type: 'saveError', error: string, cellId: string }`
- `{ type: 'insertError', error: string, rowId: string }`
- `{ type: 'deleteError', error: string, rowId: string }`

Apply error styling when these are received.

## CSS to Add

```css
.cell-selected {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}

.cell-error {
  background: rgba(255, 0, 0, 0.2) !important;
  outline: 2px solid var(--error-color) !important;
  outline-offset: -2px;
}

.row-error {
  background: rgba(255, 0, 0, 0.15) !important;
}

.row-error td {
  background: inherit !important;
}

.new-row td {
  background: rgba(76, 175, 80, 0.1);
}

.new-row td.cell-error {
  background: rgba(255, 0, 0, 0.2) !important;
}
```

## JavaScript Implementation Notes

```javascript
// State tracking
let selectedCell = null;  // Currently selected TD element
const errorCells = new Set();  // Set of cellIds with errors
const errorRows = new Set();   // Set of rowIds with errors
let newRowCounter = 0;  // For generating unique new row IDs

// Key functions to implement/modify:

function selectCell(td) {
  // Remove selection from previous cell
  // Add .cell-selected to new cell
  // Update selectedCell reference
}

function handleKeyDown(e) {
  // Handle Tab, Shift+Tab, Enter, Arrow keys, Escape
  // Start editing if alphanumeric key pressed on selected cell
}

function renderNewRow() {
  // Create an empty row at the bottom with all columns
  // Set data-row-id="new-row-{counter}"
  // Make all cells editable
}

function handleErrorResponse(type, id) {
  // Add to errorCells or errorRows set
  // Find element and add error class
}

function clearCellError(cellId) {
  // Remove from errorCells set
  // Remove .cell-error class from element
}
```

## What to Keep
- All existing sorting, filtering, pagination functionality
- Delete button on each row (but update to send rowId)
- Toast notification system
- The loading spinner and error message display
- Primary key detection and column type display

## What to Remove
- The `#addRowModal` div and all related code
- The `#addRowBtn` button in the toolbar
- The `showAddRowModal()` and `insertNewRow()` functions that use the modal

## Expected Behavior Summary
1. User clicks a cell → cell gets selected (blue border)
2. User types or double-clicks → cell enters edit mode
3. User presses Tab → save cell, move to next cell
4. User presses Enter → save cell, move down
5. User navigates to empty bottom row → can enter new row data
6. User presses Enter in new row → insert row, show new empty row
7. If save/insert/delete fails → cell/row turns red, error toast shows
8. User edits red cell → red error state clears

# Plan: Support roblox.com/transactions Page

## Information Gathered

The extension currently:
- **Matches**: `https://www.roblox.com/communities/configure*` (groups sales page only)
- **Group ID extraction**: From URL patterns `/groups/(\d+)` or `?id=(\d+)` via `getGroupIdFromUrl()`
- **Transaction API**: `/v2/groups/{groupId}/transactions?limit=100&transactionType=Sale`
- **Purpose**: Track group sales and analytics

The transactions page (`roblox.com/transactions`) is the user's transaction history page showing their purchases and sales.

---

## Plan

### 1. manifest.json
Add new URL match pattern for the transactions page:
```json
"https://www.roblox.com/transactions*"
```

### 2. content-utils.js - Update `getGroupIdFromUrl()`
Add logic to detect the transactions page and extract group ID differently:
- On transactions page, group ID may be in URL query param or from transaction data
- Need to support patterns like `?groupId=123` or detect selected group filter

### 3. content-utils.js - Add `getTransactionPageContext()`
New function to determine what context we're on (group sales vs user transactions)

### 4. content-scanner.js - Add alternative scanning logic
Support scanning user transactions and associating with groups:
- Parse transaction entries from DOM on transactions page
- Or use different API endpoint for user transactions
- Extract group ownership from transaction details

### 5. content.js - Update initialization
Handle the different page contexts appropriately

---

## Dependent Files to Edit
1. `manifest.json` - Add URL match
2. `content-utils.js` - Add page context detection
3. `content-scanner.js` - Add alternative scanning
4. `content.js` - Handle page type

---

## Followup Steps
- Test on `roblox.com/communities/configure` (existing - must still work)
- Test on `roblox.com/transactions` (new functionality)

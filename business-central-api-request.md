# Business Central API Access — Request for IT / BC Partner

**Context:** We use an internal tool (ImprintID) to generate printing/imprint
proofs. We'd like it to automatically pull order details from Business
Central — order number, item, color, imprint method, quantity, special
request — instead of our team re-typing them by hand. This document lists
exactly what we need set up to make that connection.

The integration will run **server-side only**, on a server we control inside
our own office network. It will never run in a web browser and will never be
exposed publicly, so credentials stay contained.

---

## 1. Azure AD App Registration

Please create an **Azure AD App Registration** (sometimes called a "service
principal") with:

- **API permissions:** `Application` type (not delegated) permission for
  **Dynamics 365 Business Central** — read access to Sales Orders is all we
  need. If you can scope it more narrowly than full read/write access,
  please do (principle of least privilege).
- A **Client Secret** generated for it, with the expiration date noted so we
  know when it needs to be rotated.

Please send us (through a secure channel — not email/chat in plain text):

| Value | Example |
|---|---|
| Tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| Client ID (Application ID) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| Client Secret | *(sent securely)* |

## 2. Environment details

- **Environment name** in Business Central Online (e.g. `Production`,
  `Sandbox`) that we should connect to.
- **Company name/ID** within that environment (a BC tenant can contain
  multiple companies — we need to know which one holds these sales orders).

## 3. Where "Item Color" and "Imprint Method" live

These aren't standard Business Central fields, so we need to know exactly
how to read them via the API:

- Are they exposed through the **standard Sales Order API** (as extension
  fields), a **custom API page** someone built for us, **Item Variants**, or
  **Item Attributes**?
- The exact **field/JSON property names** as they appear in the API
  response — not just the on-screen label in the BC client, since those
  can differ.
- If possible, a sample API response (e.g. from Postman, or Business
  Central's built-in API metadata/`$metadata` endpoint) showing a real
  sales order with these fields populated. This is the fastest way for us
  to confirm the mapping is right on the first try.

## 4. What we'll do with this

Once we have the above, we'll build a small integration on our internal
server that:
- Looks up a sales order by order number
- Pulls Item Code, Item Color, Imprint Method, Total Quantity, and Special
  Request
- Fills those into the proof automatically, so our team only needs to
  position the logo and generate the PDF

No data is written back to Business Central — this is read-only, one
direction (BC → ImprintID).

---

*Questions about this request can be directed back to [your name / contact].*

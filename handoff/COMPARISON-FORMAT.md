# Saving a product comparison into Roadmap

For the chat that studies products (photos, reviews, specs). When the study is
done, save it with **one SQL call**. Roadmap then shows a ⚖ Compare button on
the shopping task, ranks the products by what the owner cares about, and lets
them pick one. Buying itself stays with the Cost app.

Database: Supabase project `General_apps` (`wylxvmkcrexwfpjpbhyy`).
Tables: `roadmap_comparisons`, `roadmap_comparison_items` (migration 0008).

## The call

```sql
select roadmap_save_comparison($json$
{
  "user_id": "<owner's user id — see below>",
  "title": "Garlic crusher",
  "task_title": "Garlic crusher, cutting board",
  "need": "Daily cooking, must be dishwasher safe",
  "source": "product research chat",
  "items": [
    {
      "name": "Solid press",
      "brand": "Kai", "model": "DH-7000",
      "price": 3000, "currency": "JPY",
      "quality": 4,
      "life_years": 5,
      "warranty_months": 12,
      "rating": 4.4, "review_count": 1280,
      "size": "18 cm, fits the drawer",
      "shop": "Amazon.co.jp",
      "url": "https://…",
      "image_url": "https://…/photo.jpg",
      "pros": ["Stainless", "Dishwasher safe"],
      "cons": ["Heavy"],
      "extra": { "weight_g": 240 },
      "notes": "Best value in the study"
    }
  ]
}
$json$::jsonb);
```

It returns the comparison id.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `user_id` | only from the SQL console | The owner. Signed-in app calls use the session instead. |
| `title` | yes | What is being compared, e.g. "Garlic crusher". |
| `task_id` | no | Link to this exact Roadmap task. |
| `task_title` | no | Link to the newest **open** task with exactly this title. |
| `need` | no | One line: what it is for. |
| `source` | no | Who made the study. |
| `weights` | no | `{ "price": 0–3, "per_year": 0–3, "quality": 0–3, "life": 0–3, "warranty": 0–3, "rating": 0–3 }`. Leave it out and the owner sets it in the app. |
| `notes` | no | A note for the whole study. |
| `items` | yes | At least one product. |

Per product: `name` (required), `brand`, `model`, `price` (number), `currency`
(default `JPY`), `quality` (0–5), `life_years`, `warranty_months`, `rating`
(0–5 review average), `review_count`, `size` (free text), `shop`, `url`,
`image_url`, `pros` and `cons` (lists of short phrases), `extra` (any other
measurable thing as `{ "name": value }`), `notes`.

Leave out what you don't know. A missing value is never guessed. The product
simply scores 0 on that criterion.

## Which task it attaches to

1. `task_id`, if given.
2. Else the newest open task whose title equals `task_title` (any case).
3. Else a new parked task **"Buy &lt;title&gt;"** in Inbox › Captured › Shopping.

Saving again with the same title for the same task **replaces** its products.
The owner's weights stay unless the new call sets `weights`. Their pick is
cleared, because the products changed.

## Finding the owner's user id

```sql
select distinct user_id from roadmap_tasks limit 5;
```

## How Roadmap ranks

Each criterion is scaled 0–1 across the products that have it, so the best
gets 1. **Cost per year** is `price / life_years`, so a cheap item that breaks
soon loses to one that lasts. The score is the weighted mean, shown 0–100.
Defaults: quality High, price, cost per year and life Medium, warranty and
reviews Low.

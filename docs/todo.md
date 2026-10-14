# Your to-do list

Things only you can do, in rough priority order. This file holds active
items only: when something is done it is removed, never ticked off. Claude
keeps it current as work lands; add your own items freely.

## Run once

- **Run the storage sweep** so the photos you uploaded before today get
  their smooth card sizes (new uploads make them on their own):

  ```sh
  curl -H "Authorization: Bearer $CRON_SECRET" https://garageholds.com/api/sweep
  ```

  The response should show `photoSizes` of 3 or so. Until then those cards
  still show the full-size photo, which looks grainy when zoomed out. The
  nightly cron does the same if you would rather wait.

## Settings to add

- **`ALERT_WEBHOOK_URL` on Vercel.** Where feedback, design reports, and
  upload-allowance notices arrive. Discord: Server Settings → Integrations →
  Webhooks → New Webhook → pick a channel → Copy Webhook URL. Slack's
  "Incoming Webhooks" app gives the same kind of URL. Add it under
  Settings → Environment Variables (Production, Sensitive), then redeploy.
  Until then these messages only reach the Vercel log.
- **`NEXT_PUBLIC_CONTACT_EMAIL` on Vercel.** Shown to anyone who reaches
  their upload allowance so they can ask for more. Any address you are
  willing to make public. Redeploy after adding.

## Sign-ups for the gear page and tip jar

- **Amazon Associates: make three sales by April 2027.** The account is
  open and `garageholds-20` is live on the site, but Amazon only reviews
  the application after the first three qualifying sales, and closes it
  after 180 days without any. Getting the guide in front of people is what
  starts that.
- **Stripe: finish verification.** The tip link is live in the footer, but
  payouts wait until the bank account and identity details in the Stripe
  dashboard are complete. Settings → Business → Public details should say
  "Garage Holds" for the public name and statement descriptor.

## Domain and search

The site is at `https://garageholds.com`, bought through Vercel. The www
and old vercel.app addresses redirect to it.

- **Search Console and Vercel Analytics are on.** Search Console data
  appears a couple of days after the first crawl; check Performance there
  and the Analytics tab on Vercel after the first posts go out.

## Things to try in a browser

- **Crimp Lab on the live site** (`/make/crimp`): move a few sliders, try a
  preset and "New variation", export an STL and open it in your slicer. On
  your phone, check the hold stays pinned above the sliders while you scroll.

- **Phone photo round trip.** Open `/upload` on the computer, press "Add
  photos from your phone", scan with the phone, take a photo, confirm it
  appears on the computer within a few seconds. Then the same from a
  design's edit page, where also adding a photo from the computer's files
  should work alongside it, and where "Crop" on an existing photo should
  save a cropped copy.
- **Model orientation.** On the edit page of a design with an STL, press
  "Orientation", flip the model over, and check the design page and its
  card follow. Try the same on a fresh upload.
- **Second-account test, remaining half.** From the incognito account,
  save the published design. As the owner, edit one word of its
  description and remove a photo. Claude can confirm both from the data.
- **Mobile and both themes** on the catalog, a design page (tap the
  thumbnails and the "3D preview" tile, drag the model around, try "On a
  board" and its angle slider), the upload page, and the edit page.
- **Send one feedback message** from the footer after the webhook is set,
  to see the ping arrive.

## Local tooling

- **Docker walkthrough** in `docs/local-stack.md`: install Docker Desktop,
  `npm run db:start`, `npm run test:integration`. Needed before you change
  the schema yourself; CI runs the same stack in the meantime.

## Content

- **Photos for the printing guide** (`/how-to-3d-print-climbing-holds`):
  a printed hold on the wall, one on the print bed, and a close-up of
  fuzzy skin. Alex is on it. Send them to Claude, who adds them
  with alt text and uses the wall shot as the link preview image.

- **Seed the library** with your own holds: real recipes, photos on a wall.
- **Upload the two granite crimps** from `rileywhy/holdmaking` as the
  first real designs: run `generate_granite_crimps.py` there (the folder's
  README has the pip line), upload each `.stl` with `preview.png`, and use
  the README's print settings as the recipe.
- **Ask two or three designers** whose CC-licensed holds you like whether
  you may re-host them with credit.

## Open questions for Claude

- Google sign-in: is the Google Cloud OAuth client done, and is the
  consent screen still in "Testing" (only listed test users can sign in)?
- Laptop RAM, and whether Docker Desktop is installed yet.

## Later, when you say so

- **Tidy the repo layout.** Claude's plan: split `src/features/holds` into
  `holds` and `stl-preview`; split `src/features/uploads` into `uploads`,
  `phone-handoff`, `photos`, and `storage`; break `globals.css` into one
  file per feature; add a one-line-per-folder map to the README. Files
  move, no logic changes. Do it after the copy pass so the two don't
  collide.

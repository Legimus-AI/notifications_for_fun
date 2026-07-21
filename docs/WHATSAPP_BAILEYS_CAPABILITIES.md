# WhatsApp Baileys Capability Map

Last updated: 2026-06-17.

This project can send more than plain WhatsApp text/media. The current
Baileys socket path supports native WhatsApp message surfaces that normal
WhatsApp clients do not expose directly. Treat this file as the operational
map for Albor, Codex, notify, and other agents before experimenting.

## Frontend Lab

The Beelink frontend exposes two operator views:

- `/whatsapp/tester` -> `Avanzado` tab: build payloads, preview the element,
  edit JSON, and send supported samples to a target number.
- `/whatsapp/elements`: documentation gallery with previews, payload examples,
  render notes, and limitations for every known element.

The shared frontend source of truth is
`notifications_for_fun_frontend/src/data/whatsappAdvancedElements.ts`.

## Primary Endpoint

Use the unified WhatsApp endpoint:

```http
POST /api/whatsapp/channels/{channelId}/messages
Content-Type: application/json

{
  "to": "51999999999",
  "type": "text|image|interactive|raw_proto|...",
  "...": {}
}
```

Known Beelink channel used for experiments:

- Channel: `15a676f0-1def-468f-b146-a39f363ea057`
- Sender phone: `51957255827`
- Process: `notifications_for_fun`
- Runtime: PM2 on Beelink, port `4500`

Do not trust HTTP 200 alone. Always inspect WhatsApp acks in PM2 logs:

```bash
pm2 logs notifications_for_fun --lines 200 --nostream
```

Status code map used by the service:

- `3`: delivered
- `4`: read
- `0`: failed/rejected
- Baileys ack errors seen: `405`, `473`, `479`

## Supported High-Level Types

These types are implemented in `src/services/WhatsAppService.ts`:

| Type | Notes |
| --- | --- |
| `text` | Plain text with typing simulation. |
| `image`, `video`, `audio`, `sticker`, `document` | Link or base64 media. |
| `location`, `contact`, `contacts` | Native location/contact cards. |
| `reaction` | Automated emoji reaction to a previous message. |
| `poll` | Native WhatsApp poll. Multi-select rendered correctly in tests. |
| `event` | Native event/reunion card. |
| `view_once` | View-once image/video. Web may show "open on phone". |
| `album` | Grouped multi-image/video album. |
| `edit`, `delete` | Edit/delete previously sent messages. |
| `presence` | Typing/recording/read presence utilities. |
| `request_phone_number` | Native request to share phone number. |
| `pin`, `forward` | Pin/unpin and forward message operations. |
| `disappearing`, `limit_sharing` | Chat setting protocol messages. |
| `group` | Create group, mention, participant updates. |
| `interactive` | Native-flow buttons, carousels, and partial list support. |
| `product`, `catalog_card`, `order` | Commerce/product/order surfaces. |
| `raw_proto` | Escape hatch for any `proto.Message.fromObject` payload. |

## Confirmed Working Elements

The following were delivered and visually confirmed during testing:

| Element | API type | Behavior |
| --- | --- | --- |
| Native product carousel | `interactive.carousel` | Horizontal cards with image and CTA. |
| Quick reply buttons | `interactive.button` | Render as native buttons when relay nodes are added. |
| CTA URL | `interactive.native_flow` / button | Renders `Abrir sitio`. |
| CTA copy | `interactive.native_flow` / button | Renders `Copiar codigo`. |
| CTA call | `interactive.native_flow` / button | Renders `Llamar`. |
| Flow message surface | `interactive.flow` -> native `flow_message` | Experimental Baileys wrapper for a published Flow id/token. |
| Product card | `product` / `catalog_card` | Renders card with image/title/price. |
| Order/cart card | `order` | Renders estimated total and order request CTA. |
| Poll | `poll` | Multi-select poll rendered and accepted votes. |
| Event/reunion | `event` | Renders calendar card with RSVP. |
| Request phone | `request_phone_number` | Shows WhatsApp share-phone prompt. |
| Edit/delete | `edit`, `delete` | Message updated and removed in chat. |
| Pin/unpin | `pin` | System pin messages appear. |
| Limit sharing | `limit_sharing` | Advanced privacy system messages appear. |
| Disappearing messages | `disappearing` | Temporary-message system messages appear. |
| Call log | `raw_proto.callLogMesssage` | Renders "Tap to call again". |
| Newsletter invite | `raw_proto.newsletterFollowerInviteMessageV2` | Renders channel invite card; fake JID click fails. |
| Newsletter admin invite | `raw_proto.newsletterAdminInviteMessage` | Renders admin invite card; fake JID click fails. |
| Payment invite | `raw_proto.paymentInviteMessage` | Renders WhatsApp payment invite. |
| Request payment | `raw_proto.requestPaymentMessage` | Renders payment request card. |
| Send payment | `raw_proto.sendPaymentMessage` | Renders payment message, amount may be unavailable. |
| Status Q/A | `raw_proto.statusQuestionAnswerMessage` | Delivered as a status-question response surface. |
| Status quoted Q/A | `raw_proto.statusQuotedMessage` | Delivered as quoted status surface. |
| BCall | `raw_proto.bcallMessage` | Delivered as business call style message. |
| PTV/video note | `video.ptv: true` | Renders circular video note. |
| GIF playback | `video.gifPlayback: true` | Renders video with GIF-style playback. |
| View-once media | `view_once` | Renders view-once image/video on mobile clients. |
| Album media | `album` | Groups multiple images/videos under one visual album. |

## Gated or Rejected Elements

These payloads either failed at WhatsApp ack or rendered as unavailable:

| Element | Result | Interpretation |
| --- | --- | --- |
| Legacy list message | `405` | Modern clients/server reject old `listMessage`. |
| `single_select` native-flow list | Partial/degraded | Text may deliver, but native list did not reliably render. |
| `send_location` native flow | `405` | Server-gated native flow. |
| `cta_catalog` native flow | `473` | Requires real catalog/business context. |
| `automated_greeting_message_view_catalog` | `473` | Requires real business/catalog context. |
| `call_permission_request` | `473` | Permission/feature gated. |
| `wa_payment_transaction_details` | `405` | Payment transaction context required. |
| Raw event with reminder/join link | `479` | Malformed or unsupported server-side. |
| `questionMessage` future-proof wrapper | Degraded | Often shows "could not load". |
| `richResponseMessage` | Degraded | Meta AI rich response is not reliable via normal chat. |
| Sticker pack message | Degraded/not visually useful | Needs full uploaded sticker-pack media metadata. |

## Native-Flow Implementation Notes

Native-flow buttons need more than message content. The service wraps
`interactiveMessage` inside a `viewOnceMessage` envelope and adds relay nodes:

- `biz > interactive type=native_flow`
- `native_flow v=9 name=mixed` for general buttons
- `native_flow v=2 name=<specific>` for gated names
- `bot biz_bot=1` for private chats

This is why quick replies, URL, copy, and call CTAs render from a normal
Baileys account.

## WhatsApp Flows vs Native Flow Buttons

Do not confuse these:

- `interactive.native_flow` in this project is a Baileys socket/proto surface.
- Official WhatsApp Flows are WABA/Cloud API assets with `flow_id`, published
  Flow JSON, and `interactive.type = "flow"`.
- The tester includes `flow_message` as an experimental Baileys wrapper. It can
  construct `flow_message_version`, `flow_id`, `flow_token`, `flow_cta`, and
  `flow_action_payload`, but a fake id/token will not open a real form.
- The docs gallery includes `Flow JSON lead form` as `cloud_only`. That JSON is
  intended for Meta Flow Builder/API upload, not direct Baileys delivery.

Use official WhatsApp Flows for reliable forms, privacy-policy screens,
consent checkboxes, and submit handling. Baileys-native experiments are good
for discovery and demos, not as the stable form engine.

## Status vs Channels

WhatsApp Status is not public-global. Sending to `status@broadcast` still
requires an audience list (`statusJidList`) and only reaches contacts/audience
allowed by WhatsApp privacy settings.

For public/followable distribution, use WhatsApp Channels/newsletters instead.
Baileys exposes newsletter methods and newsletter invite message types, but
creating or publishing an official Legimus channel should be an explicit
business decision, not an automatic experiment.

Official references:

- WhatsApp Status privacy: https://faq.whatsapp.com/3307102709559968
- WhatsApp Channels overview: https://faq.whatsapp.com/549900560675125
- Create a WhatsApp Channel: https://faq.whatsapp.com/265055289421317
- WhatsApp Flows: https://developers.facebook.com/docs/whatsapp/flows/

## Experiment Safety Rules

- Test 1:1 before groups, status, or channels.
- Send slowly; avoid large bursts.
- Log every message id and check ack status.
- Treat `raw_proto` as experimental unless the element is listed as confirmed.
- Do not create public channels, alter channel ownership, or mass-post status
  without Victor's explicit confirmation.
- Normal-user WhatsApp accounts may have more ban risk than WABA-approved
  Cloud API flows/templates. Keep production features conservative.

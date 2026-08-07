// Generates a VAPID key pair for web push.
//
//   node scripts/generateVapidKeys.mjs
//
// Run once per environment and paste the output into .env (and into the Vercel
// project settings for production). The pair is an identity, not a secret in
// the password sense: rotating it invalidates every existing subscription,
// because a subscription is minted against a specific public key and the push
// service will refuse a request signed by a different one. So generate once,
// keep it, and treat losing the private key as "every athlete has to re-enable
// notifications".

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to .env — and to Vercel's environment variables for production.
VAPID_SUBJECT must be a mailto: or https:// URL a push service can reach you at.

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:help@prform.app

Rotating these later unsubscribes every device. Generate once and keep them.
`);

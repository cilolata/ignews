import { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";
import Stripe from "stripe";
import { stripe } from "../../services/stripe";
import { saveSubscription } from "./_lib/manageSubscription";

async function buffer(readable: Readable) {
    const chunks = []

    for await (const chunk of readable){
        chunk.push(
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        )
    }
    
    return Buffer.concat(chunks)
}

export const config = {
    api: {
        bodyParser: false
    }
}

const relevantEvent = new Set([
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted'
])

// eslint-disable-next-line import/no-anonymous-default-export
export default async (req: NextApiRequest, res: NextApiResponse ) => {
    if(req.method === 'POST'){
        const buf = await buffer(req)
        const secret = req.headers['stripe-signature']

        let event: Stripe.Event

        try {   
            event = stripe.webhooks.constructEvent(buf, secret, process.env.STRIPE_WEBHOOK_SECRET)
            console.log(event)
        } catch(err) {
            res.status(400).send(`webhook error: ${err.message}`)
        }

        const { type } = event

        if (relevantEvent.has(type)) {
            try {
              switch (type) {
                case "checkout.session.completed":
                  //Tipagem unica para o evento de Checkout Completed
                  const checkoutSession = event.data[
                    "object"
                  ] as Stripe.Checkout.Session;
      
                  await saveSubscription(
                    checkoutSession.subscription.toString(),
                    checkoutSession.customer.toString(),
                  );
                  break;
      
                default:
                  // throw new Error("Unhandled event.");
                  break;
              }
            } catch(error) {
              console.log(error);
              return res.status(400).json({ error: "Webhook handler failed." });
            }
          }
      
          res.json({ ok: true });
        } else {
          res.setHeader("Allow", "POST");
          res.status(405).end("Method not allowed");
        }
      };
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");
const { Resend } = require("resend");
const multer = require("multer");

const upload = multer();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

app.use(cors());

const PREZZI_PACCHETTI = {
  'LP-SMALL': { nome: 'Landing Page - Small', prezzoCentesimi: 35000 },
  'LP-MEDIUM': { nome: 'Landing Page - Medium', prezzoCentesimi: 45000 },
  'LP-LARGE': { nome: 'Landing Page - Large', prezzoCentesimi: 60000 }
};

// 1. ENDPOINT CHECKOUT: Crea solo la sessione Stripe (senza inviare l'email)
app.post("/api/create-checkout-session", express.json(), upload.array('allegato'), async (req, res) => {
  try {
    const { nome, cognome, email, dominio, tema, carrello, items } = req.body;

    if (!items) {
      return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    const lineItems = parsedItems.map(item => {
      const infoProdotto = PREZZI_PACCHETTI[item.id] || { 
        nome: item.nome || 'Progetto Web', 
        prezzoCentesimi: (item.prezzo || 0) * 100 
      };
      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: infoProdotto.nome,
          },
          unit_amount: infoProdotto.prezzoCentesimi,
        },
        quantity: item.quantita || 1,
      };
    });

    const sessionConfig = {
      mode: 'payment',
      billing_address_collection: 'auto',
      submit_type: 'auto',
      line_items: lineItems,
      success_url: 'https://ngwebdesigner.com/conferma.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://ngwebdesigner.com/landing-page.html',
      // Salviamo i dati nei metadata di Stripe per recuperarli dopo il pagamento
      metadata: {
        cliente_nome: `${nome || ''} ${cognome || ''}`.trim(),
        cliente_email: email || '',
        dominio: dominio || '',
        tema: tema || '',
        carrello: carrello || ''
      }
    };

    if (email && email.trim() !== '' && email.includes('@')) {
      sessionConfig.customer_email = email.trim();
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });

  } catch (error) {
    console.error("Errore creazione checkout:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. ENDPOINT WEBHOOK: Riceve la conferma da Stripe a pagamento COMPLETATO
app.post("/api/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verifica che la chiamata arrivi davvero da Stripe usando la chiave segreta Webhook
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Errore firma Webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Se il pagamento è andato a buon fine
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata || {};

    try {
      // Invia l'email con Resend SOLO ORA
      await resend.emails.send({
        from: 'NG Web Designer Store <onboarding@resend.dev>',
        to: 'nicusorgeorge.lav@gmail.com',
        subject: `✅ PAGATO: Nuovo Ordine Landing Page da ${meta.cliente_nome || 'Cliente'}`,
        html: `
          <h2>Pagamento Confermato su Stripe! 🎉</h2>
          <p><strong>Cliente:</strong> ${meta.cliente_nome}</p>
          <p><strong>Email Cliente:</strong> ${meta.cliente_email}</p>
          <p><strong>Dominio Desiderato:</strong> ${meta.dominio}</p>
          <p><strong>Tema / Obiettivo:</strong> ${meta.tema}</p>
          <hr/>
          <h3>Riepilogo Carrello:</h3>
          <p>${meta.carrello}</p>
          <p><strong>ID Transazione Stripe:</strong> ${session.payment_intent}</p>
        `
      });
      console.log("Email inviata con successo dopo il pagamento!");
    } catch (emailErr) {
      console.error("Errore invio email post-pagamento:", emailErr);
    }
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server attivo sulla porta ${PORT}`));
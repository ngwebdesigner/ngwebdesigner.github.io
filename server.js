require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");

// Inizializza Stripe con la tua chiave segreta salvata nelle variabili d'ambiente
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-03-25.dahlia',
});

const app = express();

// Permette le richieste CORS e la lettura di JSON
app.use(cors());
app.use(express.json());

// Mappa dei prezzi dei pacchetti in Euro (centesimi) o ID dei prodotti Stripe
const PREZZI_PACCHETTI = {
  'LP-SMALL': { nome: 'Landing Page - Small', prezzoCentesimi: 35000 },
  'LP-MEDIUM': { nome: 'Landing Page - Medium', prezzoCentesimi: 45000 },
  'LP-LARGE': { nome: 'Landing Page - Large', prezzoCentesimi: 60000 }
};

// Endpoint per la creazione della sessione di checkout di Stripe
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    // Costruiamo gli elementi per il checkout di Stripe
    const lineItems = items.map(item => {
      const infoProdotto = PREZZI_PACCHETTI[item.id] || { nome: item.nome, prezzoCentesimi: item.prezzo * 100 };
      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: infoProdotto.nome,
          },
          unit_amount: infoProdotto.prezzoCentesimi,
        },
        quantity: item.quantita,
      };
    });

    // Parametri configurati per Stripe Embedded Checkout
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'form',
      mode: 'payment',
      billing_address_collection: 'auto',
      submit_type: 'auto',
      line_items: lineItems,
      return_url: `${process.env.DOMAIN || 'https://ngwebdesigner.github.io'}/conferma.html?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.json({ client_secret: session.client_secret });
  } catch (error) {
    console.error("Errore nella creazione della sessione Stripe:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server attivo sulla porta ${PORT}`));
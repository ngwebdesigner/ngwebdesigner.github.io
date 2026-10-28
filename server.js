require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Stripe } = require("stripe");
const { Resend } = require("resend");
const multer = require("multer");

// Configurazione Multer per gestire i file in memoria
const upload = multer();

// Inizializza Stripe e Resend
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

app.use(cors());
app.use(express.json());

const PREZZI_PACCHETTI = {
  'LP-SMALL': { nome: 'Landing Page - Small', prezzoCentesimi: 35000 },
  'LP-MEDIUM': { nome: 'Landing Page - Medium', prezzoCentesimi: 45000 },
  'LP-LARGE': { nome: 'Landing Page - Large', prezzoCentesimi: 60000 }
};

// Endpoint unificato
app.post("/api/create-checkout-session", upload.array('allegato'), async (req, res) => {
  try {
    const { nome, cognome, email, dominio, tema, carrello, items } = req.body;
    const files = req.files;

    if (!items) {
      return res.status(400).json({ error: "Il carrello è vuoto" });
    }

    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    // 1. Invio email con Resend
    try {
      const attachments = files && files.length > 0 ? files.map(file => ({
        filename: file.originalname,
        content: file.buffer
      })) : [];

      await resend.emails.send({
        from: 'NG Web Designer Store <onboarding@resend.dev>',
        to: 'nicusorgeorge.lav@gmail.com',
        subject: `🚀 Nuovo Ordine Landing Page da ${nome || ''} ${cognome || ''}`,
        html: `
          <h2>Nuovo Progetto Ricevuto!</h2>
          <p><strong>Nome:</strong> ${nome || ''} ${cognome || ''}</p>
          <p><strong>Email Cliente:</strong> ${email || ''}</p>
          <p><strong>Dominio Desiderato:</strong> ${dominio || ''}</p>
          <p><strong>Tema / Obiettivo:</strong> ${tema || ''}</p>
          <hr/>
          <h3>Riepilogo Carrello:</h3>
          <p>${carrello || ''}</p>
        `,
        attachments: attachments
      });
    } catch (emailErr) {
      console.error("Attenzione: Errore invio email con Resend:", emailErr);
    }

    // 2. Costruzione carrello Stripe
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

    // 3. Configurazione Sessione Stripe Checkout (URL FISSI E SICURI)
    const sessionConfig = {
      mode: 'payment',
      billing_address_collection: 'auto',
      submit_type: 'auto',
      line_items: lineItems,
      success_url: 'https://ngwebdesigner.com/conferma.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://ngwebdesigner.com/landing-page.html',
    };

    // Aggiunge l'email solo se valida
    if (email && email.trim() !== '' && email.includes('@')) {
      sessionConfig.customer_email = email.trim();
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Ritorna l'URL al frontend
    res.json({ url: session.url });

  } catch (error) {
    console.error("Errore generale backend Stripe:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server attivo sulla porta ${PORT}`));
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore(app);

const users = await db.collection('poker_users').count().get();
const games = await db.collection('poker_games').count().get();
console.log(
  `connected to ${process.env.FIREBASE_PROJECT_ID}: poker_users=${users.data().count} poker_games=${games.data().count}`,
);

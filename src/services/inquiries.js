import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseFirestore';

const STORAGE_KEY = 'black-wolf-studio:inquiries';

export async function submitInquiry(values) {
  const payload = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    interest: values.interest,
    message: values.message.trim(),
    status: 'new',
    source: 'website',
  };

  if (db) {
    const result = await addDoc(collection(db, 'inquiries'), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return { id: result.id, stored: 'firestore' };
  }

  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  const fallback = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, fallback]));
  return { id: fallback.id, stored: 'local' };
}

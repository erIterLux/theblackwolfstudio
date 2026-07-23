import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceData, invalidateWorkspaceData } from './workspaceData';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function quoteStudioCheckout(payload) {
    const response = await callable('quoteStudioCheckout')(payload);
    return response.data;
}

export async function startStudioCheckout(payload) {
    const response = await callable('createStudioCheckout')(payload);
    const url = response.data?.url;
    if (!url) throw new Error('Stripe Checkout did not return a URL.');
    window.location.assign(url);
}

export async function getStudioOrder(orderId, accessToken = '') {
    const response = await callable('getStudioOrder')({ orderId, accessToken });
    return response.data;
}

export async function listMyStudioOrders() {
    return getWorkspaceData('memberStudioOrders');
}

export async function saveStudioOffer(payload) {
    const response = await callable('saveStudioOffer')(payload);
    invalidateWorkspaceData('commerceFoundation', 'instructorPrivateTraining');
    return response.data;
}

export async function saveStudioDiscount(payload) {
    const response = await callable('saveStudioDiscount')(payload);
    invalidateWorkspaceData('commerceFoundation');
    return response.data;
}

export async function listCommerceFoundationAdmin(options = {}) {
    return getWorkspaceData('commerceFoundation', {}, options);
}

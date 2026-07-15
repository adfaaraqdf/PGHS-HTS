import {
  Timestamp,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

function snapshotData(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function subscribe(target, onData, onError) {
  return onSnapshot(target, (snapshot) => onData(snapshot.exists === undefined ? snapshotData(snapshot) : (snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)), onError);
}

export function createMarketDataService({ firestore }) {
  const clubs = collection(firestore, 'clubs');
  const news = collection(firestore, 'news');

  const activeClubs = () => query(clubs, where('isActive', '==', true), limit(20));
  const currentNews = (extra = []) => query(
    news,
    ...extra,
    where('isPublished', '==', true),
    where('expiresAt', '==', null),
    where('publishedAt', '<=', Timestamp.now()),
    orderBy('publishedAt', 'desc'),
    limit(5),
  );

  return Object.freeze({
    subscribeClubs(onData, onError) { return subscribe(activeClubs(), onData, onError); },
    subscribeClub(clubId, onData, onError) { return subscribe(doc(firestore, 'clubs', clubId), onData, onError); },
    subscribeMarketState(onData, onError) { return subscribe(doc(firestore, 'market', 'state'), onData, onError); },
    subscribeRating(clubId, onData, onError) { return subscribe(doc(firestore, 'ratings', clubId), onData, onError); },
    subscribeNews(onData, onError) { return subscribe(currentNews(), onData, onError); },
    subscribeClubNews(clubId, onData, onError) {
      return subscribe(currentNews([where('clubId', '==', clubId)]), onData, onError);
    },
    subscribeUser(uid, onData, onError) { return subscribe(doc(firestore, 'users', uid), onData, onError); },
    subscribeHoldings(uid, onData, onError) {
      return subscribe(query(collection(firestore, 'users', uid, 'holdings'), limit(20)), onData, onError);
    },
  });
}

function mapClub(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    aliases: row.aliases ?? [],
    category: row.category,
    description: row.description,
    etfId: row.etf_id,
    logoUrl: row.logo_url,
    imageUrl: row.image_url,
    boothLocation: row.booth_location,
    operatingHours: row.operating_hours,
    isActive: row.is_active,
    tradingStatus: row.trading_status,
    currentPrice: row.current_price,
    previousClose: row.previous_close,
    priceChange: row.price_change,
    priceChangeRate: Number(row.price_change_rate ?? 0),
    issuedShares: row.issued_shares,
    marketCap: row.market_cap,
    buyVolume: row.buy_volume,
    sellVolume: row.sell_volume,
    totalVolume: row.total_volume,
    averageRating: Number(row.average_rating ?? 0),
    ratingCount: row.rating_count,
  };
}

function mapHolding(row) {
  return {
    clubId: row.club_id,
    quantity: row.quantity,
    averageBuyPrice: row.average_buy_price,
  };
}

function mapNews(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    title: row.title,
    body: row.body,
    isBreaking: row.is_breaking,
    publishedAt: row.published_at,
  };
}

function createRealtimeSubscription(supabase, { channelName, table, filter, fetch }, onData, onError) {
  let active = true;
  const refresh = async () => {
    const { data, error } = await fetch();
    if (!active) return;
    if (error) onError(error);
    else onData(data);
  };

  void refresh();
  const changes = { event: '*', schema: 'public', table };
  if (filter) changes.filter = filter;
  const channel = supabase.channel(channelName)
    .on('postgres_changes', changes, () => void refresh())
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onError(new Error('realtime-unavailable'));
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function createMarketDataService({ supabase }) {
  let sequence = 0;
  const subscribe = (options, onData, onError) => createRealtimeSubscription(
    supabase,
    { ...options, channelName: `pghs-${options.table}-${sequence += 1}` },
    onData,
    onError,
  );

  const clubsQuery = () => supabase.from('clubs').select('*').eq('is_active', true).limit(20);
  const newsQuery = (clubId) => {
    const now = new Date().toISOString();
    let request = supabase.from('news').select('*')
      .eq('is_published', true)
      .lte('published_at', now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('published_at', { ascending: false })
      .limit(5);
    if (clubId) request = request.eq('club_id', clubId);
    return request;
  };

  return Object.freeze({
    subscribeClubs(onData, onError) {
      return subscribe({ table: 'clubs', fetch: async () => {
        const result = await clubsQuery();
        return { ...result, data: result.data?.map(mapClub) };
      } }, onData, onError);
    },
    subscribeClub(clubId, onData, onError) {
      return subscribe({ table: 'clubs', filter: `id=eq.${clubId}`, fetch: async () => {
        const result = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
        return { ...result, data: result.data ? mapClub(result.data) : null };
      } }, onData, onError);
    },
    subscribeMarketState(onData, onError) {
      return subscribe({ table: 'market_state', filter: 'id=eq.current', fetch: async () => {
        const result = await supabase.from('market_state').select('*').eq('id', 'current').maybeSingle();
        return { ...result, data: result.data ? { ...result.data, activeDemandWindowId: result.data.active_demand_window_id } : null };
      } }, onData, onError);
    },
    subscribeRating(clubId, onData, onError) {
      return subscribe({ table: 'ratings', filter: `club_id=eq.${clubId}`, fetch: async () => {
        const result = await supabase.from('ratings').select('*').eq('club_id', clubId).maybeSingle();
        return { ...result, data: result.data ? { averageRating: Number(result.data.average_rating), ratingCount: result.data.rating_count } : null };
      } }, onData, onError);
    },
    subscribeNews(onData, onError) {
      return subscribe({ table: 'news', fetch: async () => {
        const result = await newsQuery();
        return { ...result, data: result.data?.map(mapNews) };
      } }, onData, onError);
    },
    subscribeClubNews(clubId, onData, onError) {
      return subscribe({ table: 'news', filter: `club_id=eq.${clubId}`, fetch: async () => {
        const result = await newsQuery(clubId);
        return { ...result, data: result.data?.map(mapNews) };
      } }, onData, onError);
    },
    subscribeUser(uid, onData, onError) {
      return subscribe({ table: 'accounts', filter: `id=eq.${uid}`, fetch: () => supabase.from('accounts').select('*').eq('id', uid).maybeSingle() }, onData, onError);
    },
    subscribeHoldings(uid, onData, onError) {
      return subscribe({ table: 'holdings', filter: `user_id=eq.${uid}`, fetch: async () => {
        const result = await supabase.from('holdings').select('club_id,quantity,average_buy_price').eq('user_id', uid).limit(20);
        return { ...result, data: result.data?.map(mapHolding) };
      } }, onData, onError);
    },
  });
}

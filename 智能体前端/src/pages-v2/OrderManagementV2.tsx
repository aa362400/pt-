import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Truck } from 'lucide-react';
import { channelsApi, type MarketplaceOrder } from '../api/channels';
import { OrderManagement, type OrderManagementItem } from '../figma-exact/OrderManagement';
import { useToast } from '../components/ui/use-toast';
import {
  marketplaceOrderStatusLabel,
  mapMarketplaceOrderStatus,
} from '../utils/order-presentation';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function mapOrder(order: MarketplaceOrder): OrderManagementItem {
  const raw = asRecord(order.raw);
  const customer = asRecord(raw.customer);
  return {
    id: order.id,
    orderId: order.externalPostingNumber,
    platform: order.provider === 'OZON' ? 'Ozon' : order.provider,
    customer: typeof customer.name === 'string' ? customer.name : '平台未返回',
    email: typeof customer.email === 'string' ? customer.email : '未返回',
    products: order.itemCount,
    amount: `${Number(order.totalAmount).toLocaleString('zh-CN')} ${order.currency}`,
    status: mapMarketplaceOrderStatus(order.status),
    statusLabel: marketplaceOrderStatusLabel(order.status),
    payment: typeof raw.paymentStatus === 'string' ? raw.paymentStatus : '平台未返回',
    shipping: order.status,
    aiAction: null,
    time: new Date(order.updatedAt).toLocaleString('zh-CN', { hour12: false }),
    country: typeof raw.country === 'string' ? raw.country : '未返回',
  };
}

export default function OrderManagementV2() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [sourceOrders, setSourceOrders] = useState<MarketplaceOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await channelsApi.listOrders({ provider: 'OZON', limit: 100 });
      setSourceOrders(response.items);
      setTotal(response.total);
    }
    catch (error) {
      addToast(error instanceof Error ? error.message : '订单读取失败', 'error');
      setSourceOrders([]);
      setTotal(0);
    }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);
  const orders = useMemo(() => sourceOrders.map(mapOrder), [sourceOrders]);
  const stats = [
    { label: '待处理订单', value: String(orders.filter((item) => item.status === 'pending' || item.status === 'processing').length), icon: Clock, color: 'text-orange-600' },
    { label: '已发货', value: String(orders.filter((item) => item.status === 'shipped').length), icon: Truck, color: 'text-blue-600' },
    { label: '已完成', value: String(orders.filter((item) => item.status === 'delivered').length), icon: CheckCircle2, color: 'text-green-600' },
    { label: '异常订单', value: String(orders.filter((item) => item.status === 'issue').length), icon: AlertCircle, color: 'text-red-600' },
  ];
  return (
    <OrderManagement
      orders={orders}
      stats={stats}
      total={total}
      loading={loading}
      onRefresh={() => void load()}
      onOpenOperations={() => navigate('/orders/operations')}
    />
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, ShoppingCart, Receipt } from "lucide-react";
import "./pos-sales.css";

export default function Sales() {
  const todayStats = {
    revenue: 5243.50,
    orders: 87,
    avgOrder: 60.27,
    growth: 12.5
  };

  const salesByHour = [
    { hour: "9 AM", amount: 145 },
    { hour: "10 AM", amount: 320 },
    { hour: "11 AM", amount: 580 },
    { hour: "12 PM", amount: 890 },
    { hour: "1 PM", amount: 1050 },
    { hour: "2 PM", amount: 780 },
    { hour: "3 PM", amount: 450 },
    { hour: "4 PM", amount: 380 },
    { hour: "5 PM", amount: 650 },
  ];

  const topItems = [
    { name: "Signature Cocktail", sold: 45, revenue: 675.00 },
    { name: "House Wine", sold: 38, revenue: 570.00 },
    { name: "Premium Beer", sold: 52, revenue: 416.00 },
    { name: "Appetizer Platter", sold: 28, revenue: 420.00 },
    { name: "Dessert Special", sold: 31, revenue: 465.00 },
  ];

  return (
    <div className="pos-sales-page">
      <header className="pos-sales-heading">
        <div>
          <h1>Sales &amp; Reports</h1>
          <p>Track revenue and performance</p>
        </div>
        <Button className="pos-sales-export">
          <Receipt aria-hidden="true" />
          Export Report
        </Button>
      </header>

      <section className="pos-sales-metrics" aria-label="Sales summary">
        <Card className="pos-sales-card">
          <CardHeader className="pos-sales-card__header">
            <CardTitle>
              Today's Revenue
            </CardTitle>
            <DollarSign aria-hidden="true" />
          </CardHeader>
          <CardContent className="pos-sales-card__content">
            <strong>${todayStats.revenue.toFixed(2)}</strong>
            <p>+{todayStats.growth}% from yesterday</p>
          </CardContent>
        </Card>

        <Card className="pos-sales-card">
          <CardHeader className="pos-sales-card__header">
            <CardTitle>
              Orders
            </CardTitle>
            <ShoppingCart aria-hidden="true" />
          </CardHeader>
          <CardContent className="pos-sales-card__content">
            <strong>{todayStats.orders}</strong>
            <p>+8 from yesterday</p>
          </CardContent>
        </Card>

        <Card className="pos-sales-card">
          <CardHeader className="pos-sales-card__header">
            <CardTitle>
              Avg. Order
            </CardTitle>
            <TrendingUp aria-hidden="true" />
          </CardHeader>
          <CardContent className="pos-sales-card__content">
            <strong>${todayStats.avgOrder.toFixed(2)}</strong>
            <p>+5.3% trend</p>
          </CardContent>
        </Card>

        <Card className="pos-sales-card">
          <CardHeader className="pos-sales-card__header">
            <CardTitle>
              Peak Hour
            </CardTitle>
            <TrendingUp aria-hidden="true" />
          </CardHeader>
          <CardContent className="pos-sales-card__content">
            <strong>1 PM</strong>
            <p>$1,050 revenue</p>
          </CardContent>
        </Card>
      </section>

      <section className="pos-sales-grid">
        <Card className="pos-sales-panel">
          <CardHeader className="pos-sales-panel__header">
            <CardTitle>Sales by Hour</CardTitle>
          </CardHeader>
          <CardContent className="pos-sales-panel__content">
            <div className="pos-sales-chart">
              {salesByHour.map(item => {
                const maxAmount = Math.max(...salesByHour.map(s => s.amount));
                const percentage = (item.amount / maxAmount) * 100;
                
                return (
                  <div className="pos-sales-chart__row" key={item.hour}>
                    <div>
                      <span>{item.hour}</span>
                      <strong>${item.amount}</strong>
                    </div>
                    <div className="pos-sales-chart__track">
                      <div 
                        className="pos-sales-chart__fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="pos-sales-panel">
          <CardHeader className="pos-sales-panel__header">
            <CardTitle>Top Selling Items</CardTitle>
          </CardHeader>
          <CardContent className="pos-sales-panel__content">
            <div className="pos-sales-ranking">
              {topItems.map((item, index) => (
                <div key={item.name} className="pos-sales-ranking__row">
                  <div>
                    <span className="pos-sales-ranking__rank">
                      {index + 1}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.sold} sold</small>
                    </div>
                  </div>
                  <strong>${item.revenue.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

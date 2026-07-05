import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Nav } from "@/components/nav";
import { RecentTickersProvider } from "@/lib/tickers/recent";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Greeks from "@/pages/greeks";
import Learn from "@/pages/learn";
import Strategies from "@/pages/strategies";
import StrategyDetail from "@/pages/strategy-detail";
import Builder from "@/pages/builder";
import Scenarios from "@/pages/scenarios";
import Chain from "@/pages/chain";
import Stress from "@/pages/stress";
import Roll from "@/pages/roll";
import Copilot from "@/pages/copilot";
import Ledger from "@/pages/ledger";
import About from "@/pages/about";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/greeks" component={Greeks} />
      <Route path="/learn" component={Learn} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/strategies/:slug" component={StrategyDetail} />
      <Route path="/builder" component={Builder} />
      <Route path="/builder/legs/:encoded" component={Builder} />
      <Route path="/scenarios" component={Scenarios} />
      <Route path="/copilot" component={Copilot} />
      <Route path="/copilot/:params" component={Copilot} />
      <Route path="/chain" component={Chain} />
      <Route path="/stress" component={Stress} />
      <Route path="/stress/legs/:encoded" component={Stress} />
      <Route path="/roll" component={Roll} />
      <Route path="/roll/legs/:encoded" component={Roll} />
      <Route path="/ledger" component={Ledger} />
      <Route path="/ledger/:id" component={Ledger} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <RecentTickersProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <div className="min-h-screen bg-background">
                <Nav />
                <main>
                  <AppRouter />
                </main>
              </div>
            </Router>
          </RecentTickersProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

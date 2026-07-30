// Run once: npm run seed:examples
//
// A hand-written extensive corpus (~540 examples) covering all 48 leaf
// categories in lib/taxonomy.ts's SEED_TREE, plus loans/declare_account/
// transfer. Still short of the full 2-3k plan.md §2.3 describes — that
// full corpus is meant to come from Gemini generating variations per leaf
// once real usage exists to steer it, and from real corrections (Layer 3).
// What's here is enough to make $text retrieval genuinely useful today:
// every leaf has real phrasing variety (not mechanical amount-swaps) —
// different verbs, amount formats (plain/k-suffix/word-form/Urdu digits),
// and item names within each category.
import path from "node:path";
import { config } from "dotenv";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db";
import { ensureIndexes } from "../lib/indexes";

config({ path: path.resolve(process.cwd(), ".env.local") });

interface SeedExample {
  raw_text: string;
  expected: {
    intent: string;
    amount?: number;
    item?: string;
    category_path?: string;
    person?: string;
    account?: string;
    tags?: string[];
  };
}

const exp = (
  raw_text: string,
  amount: number,
  item: string,
  category_path: string,
): SeedExample => ({ raw_text, expected: { intent: "add_expense", amount, item, category_path } });

const inc = (raw_text: string, amount: number, category_path: string): SeedExample => ({
  raw_text,
  expected: { intent: "add_income", amount, category_path },
});

const EXAMPLES: SeedExample[] = [
  // ── Food > Dhaba/Hotel ──────────────────────────────────────────────
  exp("aj palao khaya 350 rupees", 350, "Palao", "Food > Dhaba/Hotel"),
  exp("350 ka biryani khaya", 350, "Biryani", "Food > Dhaba/Hotel"),
  exp("dost ke sath dhaba pe khana khaya 800 ka", 800, "Dhaba khana", "Food > Dhaba/Hotel"),
  exp("karahi khai 1200 ki", 1200, "Karahi", "Food > Dhaba/Hotel"),
  exp("nihari pe 450 lag gaye", 450, "Nihari", "Food > Dhaba/Hotel"),
  exp("hotel se lunch kiya 600 ka", 600, "Hotel lunch", "Food > Dhaba/Hotel"),
  exp("BBQ khaya raat ko 2200 ka", 2200, "BBQ", "Food > Dhaba/Hotel"),
  exp("chargha order kiya 1500 ka", 1500, "Chargha", "Food > Dhaba/Hotel"),
  exp("daal chawal khaye 250 ke", 250, "Daal chawal", "Food > Dhaba/Hotel"),
  exp("aj saarhay chaar sau ka khana khaya bahar", 450, "Khana", "Food > Dhaba/Hotel"),
  exp("dinner kiya restaurant mein 1800 ka", 1800, "Dinner", "Food > Dhaba/Hotel"),
  exp("wedding ke baad dhaba pe khaya 500", 500, "Dhaba", "Food > Dhaba/Hotel"),
  exp("۷۵۰ ka khana khaya office ke baad", 750, "Khana", "Food > Dhaba/Hotel"),

  // ── Food > Groceries ─────────────────────────────────────────────────
  exp("grocery pe 3000 lag gaye", 3000, "Grocery", "Food > Groceries"),
  exp("aj dhai hazaar ka grocery liya", 2500, "Grocery", "Food > Groceries"),
  exp("mahine ka ration liya 8000 ka", 8000, "Ration", "Food > Groceries"),
  exp("sabzi mandi se 700 ki sabzi li", 700, "Sabzi", "Food > Groceries"),
  exp("fruit liye 900 ke", 900, "Fruit", "Food > Groceries"),
  exp("2k ka grocery kiya store se", 2000, "Grocery", "Food > Groceries"),
  exp("chawal aur atta liya 3500 ka", 3500, "Chawal atta", "Food > Groceries"),
  exp("dudh aur dahi liya 400 ka", 400, "Dudh dahi", "Food > Groceries"),
  exp("aj grocery store gaya 1600 kharch howay", 1600, "Grocery", "Food > Groceries"),
  exp("weekly grocery 4500 ki", 4500, "Grocery", "Food > Groceries"),
  exp("saarhay teen hazaar ka ration liya is mahine", 3500, "Ration", "Food > Groceries"),
  exp("gosht liya 2200 ka", 2200, "Gosht", "Food > Groceries"),
  exp("cooking oil liya 1900 ka", 1900, "Cooking oil", "Food > Groceries"),

  // ── Food > Delivery ──────────────────────────────────────────────────
  exp("foodpanda se order kiya 550 ka", 550, "Foodpanda order", "Food > Delivery"),
  exp("bykea se khana order kiya 700 ka", 700, "Bykea food", "Food > Delivery"),
  exp("online order kiya pizza 1100 ka", 1100, "Pizza order", "Food > Delivery"),
  exp("khana ghar pe order kiya 450 ka", 450, "Khana order", "Food > Delivery"),
  exp("foodpanda pe burger order kiya 350 ka", 350, "Burger order", "Food > Delivery"),
  exp("delivery charges sath 800 ka order kiya", 800, "Delivery order", "Food > Delivery"),
  exp("late night order kiya 600 ka", 600, "Order", "Food > Delivery"),
  exp("cheeni order kiya 250 ka foodpanda se", 250, "Foodpanda order", "Food > Delivery"),
  exp("family ke liye order kiya 1500 ka", 1500, "Family order", "Food > Delivery"),
  exp("aj foodpanda pe biryani order ki 480 ki", 480, "Biryani order", "Food > Delivery"),
  exp("panda mart se order kiya 950 ka", 950, "Pandamart order", "Food > Delivery"),
  exp("subah nashta order kiya 300 ka", 300, "Nashta order", "Food > Delivery"),

  // ── Food > Chai/Nashta ───────────────────────────────────────────────
  exp("chai pe 50 rupay", 50, "Chai", "Food > Chai/Nashta"),
  exp("200 rupay ka nashta kiya", 200, "Nashta", "Food > Chai/Nashta"),
  exp("paune do sau ka nashta kiya", 175, "Nashta", "Food > Chai/Nashta"),
  exp("halwa puri khaya 300 ka", 300, "Halwa puri", "Food > Chai/Nashta"),
  exp("anda paratha khaya 150 ka", 150, "Anda paratha", "Food > Chai/Nashta"),
  exp("subah chai pi 30 rupay ki", 30, "Chai", "Food > Chai/Nashta"),
  exp("dhaba pe chai nashta kiya 250 ka", 250, "Chai nashta", "Food > Chai/Nashta"),
  exp("office ke bahar nashta kiya 220 ka", 220, "Nashta", "Food > Chai/Nashta"),
  exp("naan chana khaya 100 ka", 100, "Naan chana", "Food > Chai/Nashta"),
  exp("shaam ki chai 40 rupay ki", 40, "Chai", "Food > Chai/Nashta"),
  exp("bakery se nashta liya 180 ka", 180, "Bakery nashta", "Food > Chai/Nashta"),
  exp("dost ke sath chai pi 60 ki", 60, "Chai", "Food > Chai/Nashta"),

  // ── Food > Sweets ────────────────────────────────────────────────────
  exp("mithai li 800 ki", 800, "Mithai", "Food > Sweets"),
  exp("jalebi khai 150 ki", 150, "Jalebi", "Food > Sweets"),
  exp("gulab jaman liya 350 ka", 350, "Gulab jaman", "Food > Sweets"),
  exp("cake order kiya birthday ka 2500 ka", 2500, "Cake", "Food > Sweets"),
  exp("eid ki mithai li 1200 ki", 1200, "Eid mithai", "Food > Sweets"),
  exp("barfi khareedi 600 ki", 600, "Barfi", "Food > Sweets"),
  exp("kheer banai 400 ki cheezein le kar", 400, "Kheer saman", "Food > Sweets"),
  exp("rasgulla liya 300 ka", 300, "Rasgulla", "Food > Sweets"),
  exp("mehmano ke liye mithai li 1800 ki", 1800, "Mithai", "Food > Sweets"),
  exp("chocolate cake liya 1400 ka", 1400, "Chocolate cake", "Food > Sweets"),

  // ── Transport > InDrive ──────────────────────────────────────────────
  exp("indrive sa 150 rupa ma flat sa office gya", 150, "InDrive", "Transport > InDrive"),
  exp("in drive li ghar se 200 ki", 200, "InDrive", "Transport > InDrive"),
  exp("indriver book kiya 180 ka", 180, "InDrive", "Transport > InDrive"),
  exp("indrive se airport gaya 800 ka", 800, "InDrive", "Transport > InDrive"),
  exp("office se ghar indrive li 220 ki", 220, "InDrive", "Transport > InDrive"),
  exp("indrive ka kiraya 130 rupay tha", 130, "InDrive", "Transport > InDrive"),
  exp("late night indrive li 350 ki", 350, "InDrive", "Transport > InDrive"),
  exp("indrive se market gaya 160 ka", 160, "InDrive", "Transport > InDrive"),
  exp("saarhay do sau ki indrive li", 250, "InDrive", "Transport > InDrive"),
  exp("indrive book ki bacho ko school se lene 190 ki", 190, "InDrive", "Transport > InDrive"),
  exp("indrive se hospital gaya 300 ka", 300, "InDrive", "Transport > InDrive"),
  exp("in drive ka 240 rupay lag gaya", 240, "InDrive", "Transport > InDrive"),
  exp("indrive se dost ki shaadi pe gaya 400 ka", 400, "InDrive", "Transport > InDrive"),

  // ── Transport > Careem ───────────────────────────────────────────────
  exp("careem li 220 ki", 220, "Careem", "Transport > Careem"),
  exp("careem book kiya airport ke liye 900 ka", 900, "Careem", "Transport > Careem"),
  exp("careem se office gaya 250 ka", 250, "Careem", "Transport > Careem"),
  exp("careem bike li 100 ki", 100, "Careem Bike", "Transport > Careem"),
  exp("careem ka kiraya 300 tha", 300, "Careem", "Transport > Careem"),
  exp("careem se ghar wapas aya 280 ka", 280, "Careem", "Transport > Careem"),
  exp("careem li shopping mall ke liye 320 ki", 320, "Careem", "Transport > Careem"),
  exp("saarhay teen sau ki careem li raat ko", 350, "Careem", "Transport > Careem"),
  exp("careem se doctor ke pas gaya 260 ka", 260, "Careem", "Transport > Careem"),
  exp("careem li dost ko drop karne 200 ki", 200, "Careem", "Transport > Careem"),
  exp("careem ka fare 400 tha traffic ki wajah se", 400, "Careem", "Transport > Careem"),
  exp("careem book ki office se ghar 230 ki", 230, "Careem", "Transport > Careem"),

  // ── Transport > Rickshaw ─────────────────────────────────────────────
  exp("rickshaw wala 100 le gaya", 100, "Rickshaw", "Transport > Rickshaw"),
  exp("rickshaw ka kiraya 80 rupay tha", 80, "Rickshaw", "Transport > Rickshaw"),
  exp("chingchi li market tak 50 ki", 50, "Chingchi", "Transport > Rickshaw"),
  exp("rickshaw se school gaya bacha 60 ka", 60, "Rickshaw", "Transport > Rickshaw"),
  exp("rickshaw wale ko 120 diye", 120, "Rickshaw", "Transport > Rickshaw"),
  exp("rickshaw li mandi jane ke liye 90 ki", 90, "Rickshaw", "Transport > Rickshaw"),
  exp("chingchi ka kiraya 70 tha", 70, "Chingchi", "Transport > Rickshaw"),
  exp("rickshaw se ghar aya 100 ka", 100, "Rickshaw", "Transport > Rickshaw"),
  exp("rickshaw pe 150 kharch howay is hafte", 150, "Rickshaw", "Transport > Rickshaw"),
  exp("do rickshaw badle 130 mein", 130, "Rickshaw", "Transport > Rickshaw"),
  exp("rickshaw se office gaya subah 110 ka", 110, "Rickshaw", "Transport > Rickshaw"),

  // ── Transport > Fuel ─────────────────────────────────────────────────
  exp("petrol dalwaya 3000 ka", 3000, "Petrol", "Transport > Fuel"),
  exp("500 ka diesel dala", 500, "Diesel", "Transport > Fuel"),
  exp("saarhay teen sau ka petrol dala", 350, "Petrol", "Transport > Fuel"),
  exp("bike mein petrol dalwaya 400 ka", 400, "Petrol", "Transport > Fuel"),
  exp("cng bharwaya 800 ki", 800, "CNG", "Transport > Fuel"),
  exp("octane dalwaya 2500 ka", 2500, "Octane", "Transport > Fuel"),
  exp("gari full tank karwai 5000 ki", 5000, "Petrol", "Transport > Fuel"),
  exp("aj petrol pump gaya 1000 ka petrol dala", 1000, "Petrol", "Transport > Fuel"),
  exp("dhai hazaar ka fuel dalwaya", 2500, "Fuel", "Transport > Fuel"),
  exp("bike ka petrol 300 ka", 300, "Petrol", "Transport > Fuel"),
  exp("diesel bharwaya gari mein 4000 ka", 4000, "Diesel", "Transport > Fuel"),
  exp("2k ka petrol dalwaya safar se pehle", 2000, "Petrol", "Transport > Fuel"),
  exp("weekly petrol 1500 ka dala", 1500, "Petrol", "Transport > Fuel"),

  // ── Transport > Public ───────────────────────────────────────────────
  exp("bus ka kiraya 50 rupay", 50, "Bus", "Transport > Public"),
  exp("wagon mein baitha 40 ka", 40, "Wagon", "Transport > Public"),
  exp("metro bus li 60 ki", 60, "Metro bus", "Transport > Public"),
  exp("train ka ticket liya 800 ka", 800, "Train ticket", "Transport > Public"),
  exp("van mein gaya office 70 ka", 70, "Van", "Transport > Public"),
  exp("bus se dosri city gaya 1200 ka", 1200, "Bus ticket", "Transport > Public"),
  exp("local bus 30 rupay ki", 30, "Bus", "Transport > Public"),
  exp("qingqi li 45 ki school ke liye", 45, "Qingqi", "Transport > Public"),
  exp("bus stop se bus li 55 ki", 55, "Bus", "Transport > Public"),
  exp("shared van mein gaya 80 ka", 80, "Van", "Transport > Public"),
  exp("intercity bus ka ticket 1500 ka", 1500, "Bus ticket", "Transport > Public"),

  // ── Transport > Maintenance ──────────────────────────────────────────
  exp("gari ki service karwai 4500 ki", 4500, "Service", "Transport > Maintenance"),
  exp("bike ki servicing karwai 1200 ki", 1200, "Bike service", "Transport > Maintenance"),
  exp("tyre badlwaya 3500 ka", 3500, "Tyre", "Transport > Maintenance"),
  exp("oil change karwaya 1800 ka", 1800, "Oil change", "Transport > Maintenance"),
  exp("gari wash karwai 500 ki", 500, "Car wash", "Transport > Maintenance"),
  exp("battery badalwai 6000 ki", 6000, "Battery", "Transport > Maintenance"),
  exp("mechanic ko diye 2200 gari theek karne ke", 2200, "Mechanic", "Transport > Maintenance"),
  exp("bike ka clutch banwaya 1500 ka", 1500, "Bike repair", "Transport > Maintenance"),
  exp("wheel alignment karwai 800 ki", 800, "Wheel alignment", "Transport > Maintenance"),
  exp("car AC repair karwai 3000 ki", 3000, "AC repair", "Transport > Maintenance"),
  exp("bike servicing 1000 ki karwai", 1000, "Bike service", "Transport > Maintenance"),

  // ── Transport > Parking ──────────────────────────────────────────────
  exp("parking fee di 50 rupay", 50, "Parking", "Transport > Parking"),
  exp("mall mein parking 100 ki", 100, "Parking", "Transport > Parking"),
  exp("parking token liya 30 ka", 30, "Parking token", "Transport > Parking"),
  exp("airport parking 500 ki di", 500, "Airport parking", "Transport > Parking"),
  exp("office parking 40 rupay mahana", 40, "Parking", "Transport > Parking"),
  exp("valet parking di 150 ki", 150, "Valet parking", "Transport > Parking"),
  exp("bazaar mein parking 60 ki di", 60, "Parking", "Transport > Parking"),
  exp("parking ka challan 200 ka bhara", 200, "Parking challan", "Transport > Parking"),
  exp("hospital parking 80 ki", 80, "Parking", "Transport > Parking"),

  // ── Bills > Electricity ──────────────────────────────────────────────
  exp("bijli ka bill 4500 diya", 4500, "Bijli bill", "Bills > Electricity"),
  exp("k-electric bill pay kiya 5200 ka", 5200, "K-Electric bill", "Bills > Electricity"),
  exp("lesco bill 3800 ka diya", 3800, "LESCO bill", "Bills > Electricity"),
  exp("wapda bill pay kiya 6000 ka", 6000, "WAPDA bill", "Bills > Electricity"),
  exp("bijli ka bill online pay kiya 4200 ka", 4200, "Bijli bill", "Bills > Electricity"),
  exp("garmiyon mein bijli bill 8500 aya", 8500, "Bijli bill", "Bills > Electricity"),
  exp("bijli bill jama karwaya 3500 ka", 3500, "Bijli bill", "Bills > Electricity"),
  exp("is mahine bijli ka bill 5000 tha", 5000, "Bijli bill", "Bills > Electricity"),
  exp("k electric ka bill diya 4700", 4700, "K-Electric bill", "Bills > Electricity"),
  exp("bill jama karwaya bijli ka 6200 ka", 6200, "Bijli bill", "Bills > Electricity"),
  exp("mesco bill diya 3900 ka", 3900, "MEPCO bill", "Bills > Electricity"),

  // ── Bills > Sui Gas ──────────────────────────────────────────────────
  exp("sui gas ka bill 1200", 1200, "Gas bill", "Bills > Sui Gas"),
  exp("gas bill pay kiya 1500 ka", 1500, "Gas bill", "Bills > Sui Gas"),
  exp("sui gas bill jama karwaya 900 ka", 900, "Gas bill", "Bills > Sui Gas"),
  exp("sardiyon mein gas bill 2500 aya", 2500, "Gas bill", "Bills > Sui Gas"),
  exp("gas ka bill diya 1100", 1100, "Gas bill", "Bills > Sui Gas"),
  exp("ssgc bill 1800 ka diya", 1800, "SSGC bill", "Bills > Sui Gas"),
  exp("gas bill online pay kiya 1300 ka", 1300, "Gas bill", "Bills > Sui Gas"),
  exp("is mahine gas ka bill 1000 tha", 1000, "Gas bill", "Bills > Sui Gas"),
  exp("sui gas bill 2000 jama karwaya", 2000, "Gas bill", "Bills > Sui Gas"),
  exp("gas bill 1400 ka bhara", 1400, "Gas bill", "Bills > Sui Gas"),

  // ── Bills > Internet ─────────────────────────────────────────────────
  exp("internet bill 2500 pay kiya", 2500, "Internet bill", "Bills > Internet"),
  exp("wifi bill diya 2200 ka", 2200, "WiFi bill", "Bills > Internet"),
  exp("ptcl bill pay kiya 3000 ka", 3000, "PTCL bill", "Bills > Internet"),
  exp("storm fiber ka bill 2800 diya", 2800, "StormFiber bill", "Bills > Internet"),
  exp("jazz internet bill 1800 ka pay kiya", 1800, "Jazz internet bill", "Bills > Internet"),
  exp("wifi ka bill online pay kiya 2600 ka", 2600, "WiFi bill", "Bills > Internet"),
  exp("broadband bill 3200 ka diya", 3200, "Broadband bill", "Bills > Internet"),
  exp("internet ka bill mahana 2000 hai", 2000, "Internet bill", "Bills > Internet"),
  exp("ptcl fiber bill 2400 pay kiya", 2400, "PTCL Fiber bill", "Bills > Internet"),

  // ── Bills > Mobile Load ──────────────────────────────────────────────
  exp("1000 ka mobile load dalwaya", 1000, "Mobile load", "Bills > Mobile Load"),
  exp("easyload karwaya 500 ka", 500, "Easyload", "Bills > Mobile Load"),
  exp("jazz load dalwaya 300 ka", 300, "Jazz load", "Bills > Mobile Load"),
  exp("telenor balance dalwaya 400 ka", 400, "Telenor load", "Bills > Mobile Load"),
  exp("mobile balance karwaya 250 ka", 250, "Mobile load", "Bills > Mobile Load"),
  exp("zong load dalwaya 350 ka", 350, "Zong load", "Bills > Mobile Load"),
  exp("ufone load karwaya 200 ka", 200, "Ufone load", "Bills > Mobile Load"),
  exp("mobile package activate kiya 800 ka", 800, "Mobile package", "Bills > Mobile Load"),
  exp("bacho ke number mein load dalwaya 300 ka", 300, "Mobile load", "Bills > Mobile Load"),
  exp("simple load dalwaya 500 ka", 500, "Mobile load", "Bills > Mobile Load"),
  exp("internet package liya 600 ka mobile pe", 600, "Mobile package", "Bills > Mobile Load"),

  // ── Bills > Water ────────────────────────────────────────────────────
  exp("water bill 600 rupay", 600, "Water bill", "Bills > Water"),
  exp("pani ka bill diya 500 ka", 500, "Pani bill", "Bills > Water"),
  exp("water tanker book kiya 1200 ka", 1200, "Water tanker", "Bills > Water"),
  exp("boring ka bill 700 diya", 700, "Boring bill", "Bills > Water"),
  exp("pani ka tanker mangwaya 1500 ka", 1500, "Water tanker", "Bills > Water"),
  exp("water bill jama karwaya 550 ka", 550, "Water bill", "Bills > Water"),
  exp("mineral water liya 400 ka", 400, "Mineral water", "Bills > Water"),

  // ── Home > Rent ──────────────────────────────────────────────────────
  // Only the place you actually LIVE in. "flat"/"shop"/"office" rent used to be
  // taught here too, which is what made Gemini file a separate flat's rent under
  // Home — those moved to Property > Flat Rent below.
  exp("ghar ka kiraya 35000 diya", 35000, "Kiraya", "Home > Rent"),
  exp("makan ka kiraya diya 30000 ka", 30000, "Kiraya", "Home > Rent"),
  exp("advance kiraya diya 50000 ka", 50000, "Advance kiraya", "Home > Rent"),
  exp("ghar ka rent pay kiya 40000 ka", 40000, "Rent", "Home > Rent"),
  exp("kiraya jama karwaya landlord ko 28000 ka", 28000, "Kiraya", "Home > Rent"),
  exp("mahana kiraya 32000 diya", 32000, "Kiraya", "Home > Rent"),
  exp("ghar ka kiraya do mahine ka 60000 diya", 60000, "Kiraya", "Home > Rent"),
  exp("jis ghar mein rehta hoon uska kiraya 38000 diya", 38000, "Kiraya", "Home > Rent"),

  // ── Home > Maintenance ───────────────────────────────────────────────
  exp("ghar ki repair karwai 5000 ki", 5000, "Ghar repair", "Home > Maintenance"),
  exp("plumber ko diye 1500 pipe theek karne ke", 1500, "Plumber", "Home > Maintenance"),
  exp("electrician ko bulaya 1200 diye", 1200, "Electrician", "Home > Maintenance"),
  exp("ghar ki painting karwai 15000 ki", 15000, "Painting", "Home > Maintenance"),
  exp("AC repair karwaya ghar ka 3500 ka", 3500, "AC repair", "Home > Maintenance"),
  exp("washroom fix karwaya 4000 ka", 4000, "Washroom repair", "Home > Maintenance"),
  exp("carpenter ko diye 2500 furniture ke liye", 2500, "Carpenter", "Home > Maintenance"),
  exp("chat karwai roof ki 8000 ki", 8000, "Chat repair", "Home > Maintenance"),
  exp("geyser repair karwaya 2000 ka", 2000, "Geyser repair", "Home > Maintenance"),

  // ── Property > Flat Rent ─────────────────────────────────────────────
  // A property that is NOT your residence — rent you pay on a separate flat,
  // shop or office. Deliberately distinct from Home > Rent so household
  // spending and property spending never roll up together.
  exp("Maine flat ka rent diya hai 10 hazar rupay", 10000, "Flat rent", "Property > Flat Rent"),
  exp("flat ka kiraya 25000 diya is mahine", 25000, "Flat kiraya", "Property > Flat Rent"),
  exp("flat ka rent diya 18000 ka", 18000, "Flat rent", "Property > Flat Rent"),
  exp("dusre flat ka kiraya jama karwaya 22000", 22000, "Flat kiraya", "Property > Flat Rent"),
  exp("shop ka kiraya diya 15000 ka", 15000, "Shop kiraya", "Property > Flat Rent"),
  exp("office ka rent diya 20000 ka", 20000, "Office rent", "Property > Flat Rent"),
  exp("flat ka kirya pay kiya 12k", 12000, "Flat kiraya", "Property > Flat Rent"),
  exp("walidain ke flat ka rent diya 16000", 16000, "Flat rent", "Property > Flat Rent"),
  exp("Lahore wale flat ka kiraya bheja 24000", 24000, "Flat kiraya", "Property > Flat Rent"),

  // ── Property > Bills ─────────────────────────────────────────────────
  exp("flat ka bijli ka bill diya 4500 ka", 4500, "Flat bijli", "Property > Bills"),
  exp("flat ka gas bill jama karwaya 1200 ka", 1200, "Flat gas", "Property > Bills"),
  exp("flat ka pani ka bill diya 800 ka", 800, "Flat pani", "Property > Bills"),
  exp("shop ka bijli bill 6000 ka diya", 6000, "Shop bijli", "Property > Bills"),
  exp("flat ke bills pe 3200 lag gaye", 3200, "Flat bills", "Property > Bills"),

  // ── Property > Maintenance ───────────────────────────────────────────
  exp("flat ki repair karwai 7000 ki", 7000, "Flat repair", "Property > Maintenance"),
  exp("flat mein painting karwai 12000 ki", 12000, "Flat painting", "Property > Maintenance"),
  exp("flat ka plumber ka kharcha 2500", 2500, "Flat plumber", "Property > Maintenance"),
  exp("flat ki society maintenance di 3000", 3000, "Society maintenance", "Property > Maintenance"),
  exp("shop ki maintenance pe 5500 lagaye", 5500, "Shop maintenance", "Property > Maintenance"),

  // ── Property > Tax ───────────────────────────────────────────────────
  exp("flat ka property tax diya 9000 ka", 9000, "Property tax", "Property > Tax"),
  exp("property tax jama karwaya 14000 ka", 14000, "Property tax", "Property > Tax"),
  exp("flat ka token tax diya 2500", 2500, "Token tax", "Property > Tax"),
  exp("shop ka tax bhara 7500 ka", 7500, "Shop tax", "Property > Tax"),

  // ── Home > Kitchen Items ─────────────────────────────────────────────
  exp("kitchen ka saman liya 1500 ka", 1500, "Kitchen saman", "Home > Kitchen Items"),
  exp("bartan liye 2200 ke", 2200, "Bartan", "Home > Kitchen Items"),
  exp("gas cylinder bharwaya 3000 ka", 3000, "Gas cylinder", "Home > Kitchen Items"),
  exp("kitchen mein naye bartan liye 1800 ke", 1800, "Bartan", "Home > Kitchen Items"),
  exp("cooking range ka saman liya 900 ka", 900, "Cooking saman", "Home > Kitchen Items"),
  exp("plastic ke dabbay liye 500 ke", 500, "Storage dabbay", "Home > Kitchen Items"),
  exp("blender khareeda 4500 ka", 4500, "Blender", "Home > Kitchen Items"),
  exp("chai ke cup liye 700 ke", 700, "Cups", "Home > Kitchen Items"),
  exp("kitchen saman ka saman liya 1200 ka", 1200, "Kitchen saman", "Home > Kitchen Items"),

  // ── Home > Maid/Help ─────────────────────────────────────────────────
  exp("maasi ko salary diya 8000 ka", 8000, "Maasi salary", "Home > Maid/Help"),
  exp("driver ki salary diya 25000 ki", 25000, "Driver salary", "Home > Maid/Help"),
  exp("mazdoor ko diye 3000 kaam ke", 3000, "Mazdoor", "Home > Maid/Help"),
  exp("khidmatgar ko diye 5000 is mahine", 5000, "Khidmatgar", "Home > Maid/Help"),
  exp("chowkidar ki salary 10000 di", 10000, "Chowkidar salary", "Home > Maid/Help"),
  exp("maali ko diye 2000 bagh ke kaam ke", 2000, "Maali", "Home > Maid/Help"),
  exp("cook ko salary diya 15000 ki", 15000, "Cook salary", "Home > Maid/Help"),
  exp("maasi ko bonus diya eid pe 5000", 5000, "Maasi bonus", "Home > Maid/Help"),

  // ── Health > Doctor ──────────────────────────────────────────────────
  exp("doctor ki fees 2000 di", 2000, "Doctor fees", "Health > Doctor"),
  exp("hospital ki fees 3500 di", 3500, "Hospital fees", "Health > Doctor"),
  exp("dentist ko diye 1500 checkup ke", 1500, "Dentist fees", "Health > Doctor"),
  exp("bacho ke doctor ki fees 1000 di", 1000, "Doctor fees", "Health > Doctor"),
  exp("skin specialist ki fees di 2500 ki", 2500, "Specialist fees", "Health > Doctor"),
  exp("eye doctor ko diye 1800 checkup ke", 1800, "Eye doctor fees", "Health > Doctor"),
  exp("emergency mein doctor ko diye 3000", 3000, "Doctor fees", "Health > Doctor"),
  exp("checkup karwaya 2200 ka", 2200, "Checkup", "Health > Doctor"),
  exp("dost ke doctor ki fees di 1200 ki", 1200, "Doctor fees", "Health > Doctor"),

  // ── Health > Medicine ────────────────────────────────────────────────
  exp("medicine li 800 ki", 800, "Medicine", "Health > Medicine"),
  exp("dawai li pharmacy se 500 ki", 500, "Dawai", "Health > Medicine"),
  exp("bacho ki dawai li 350 ki", 350, "Dawai", "Health > Medicine"),
  exp("medical store se dawai li 1200 ki", 1200, "Dawai", "Health > Medicine"),
  exp("panadol aur cough syrup liya 400 ka", 400, "Medicine", "Health > Medicine"),
  exp("monthly medicine li 2000 ki", 2000, "Medicine", "Health > Medicine"),
  exp("dawai khareedi 650 ki", 650, "Dawai", "Health > Medicine"),
  exp("injection lagwaya 900 ka", 900, "Injection", "Health > Medicine"),
  exp("vitamin liye 1100 ke", 1100, "Vitamins", "Health > Medicine"),
  exp("bp ki dawai li 550 ki", 550, "Dawai", "Health > Medicine"),

  // ── Health > Tests ───────────────────────────────────────────────────
  exp("blood test karwaya 1500 ka", 1500, "Blood test", "Health > Tests"),
  exp("x-ray karwaya 800 ka", 800, "X-ray", "Health > Tests"),
  exp("ultrasound karwaya 2500 ka", 2500, "Ultrasound", "Health > Tests"),
  exp("sugar test karwaya 400 ka", 400, "Sugar test", "Health > Tests"),
  exp("lab test karwaya 1200 ka", 1200, "Lab test", "Health > Tests"),
  exp("covid test karwaya 3000 ka", 3000, "Covid test", "Health > Tests"),
  exp("MRI karwai 12000 ki", 12000, "MRI", "Health > Tests"),
  exp("ct scan karwaya 8000 ka", 8000, "CT scan", "Health > Tests"),

  // ── Health > Gym ─────────────────────────────────────────────────────
  exp("gym ki fees 3000", 3000, "Gym fees", "Health > Gym"),
  exp("gym membership li 5000 ki", 5000, "Gym membership", "Health > Gym"),
  exp("gym trainer ko diye 2000 extra", 2000, "Gym trainer", "Health > Gym"),
  exp("monthly gym fees 2500 di", 2500, "Gym fees", "Health > Gym"),
  exp("gym ka saal ka package liya 25000 ka", 25000, "Gym package", "Health > Gym"),
  exp("gym fees jama karwai 3500 ki", 3500, "Gym fees", "Health > Gym"),
  exp("protein liya gym ke liye 4000 ka", 4000, "Protein", "Health > Gym"),
  exp("gym ki fees di 2800", 2800, "Gym fees", "Health > Gym"),

  // ── Shopping > Clothes ───────────────────────────────────────────────
  exp("kapre khareede 4500 ke", 4500, "Kapre", "Shopping > Clothes"),
  exp("shalwar kameez liya 3000 ka", 3000, "Shalwar kameez", "Shopping > Clothes"),
  exp("jeans khareedi 3500 ki", 3500, "Jeans", "Shopping > Clothes"),
  exp("shirt li 2200 ki", 2200, "Shirt", "Shopping > Clothes"),
  exp("eid ke liye kapre liye 8000 ke", 8000, "Eid kapre", "Shopping > Clothes"),
  exp("bacho ke kapre liye 2000 ke", 2000, "Bacho ke kapre", "Shopping > Clothes"),
  exp("kurta khareeda 1800 ka", 1800, "Kurta", "Shopping > Clothes"),
  exp("winter jacket li 5500 ki", 5500, "Jacket", "Shopping > Clothes"),
  exp("shaadi ke liye suit liya 12000 ka", 12000, "Suit", "Shopping > Clothes"),
  exp("dupatta khareeda 1500 ka", 1500, "Dupatta", "Shopping > Clothes"),

  // ── Shopping > Electronics ───────────────────────────────────────────
  exp("mobile phone liya 45000 ka", 45000, "Mobile phone", "Shopping > Electronics"),
  exp("laptop charger liya 3500 ka", 3500, "Laptop charger", "Shopping > Electronics"),
  exp("headphones khareede 2500 ke", 2500, "Headphones", "Shopping > Electronics"),
  exp("mobile charger liya 800 ka", 800, "Mobile charger", "Shopping > Electronics"),
  exp("power bank khareeda 3000 ka", 3000, "Power bank", "Shopping > Electronics"),
  exp("keyboard liya 2200 ka", 2200, "Keyboard", "Shopping > Electronics"),
  exp("smart watch li 8000 ki", 8000, "Smart watch", "Shopping > Electronics"),
  exp("mobile cover liya 500 ka", 500, "Mobile cover", "Shopping > Electronics"),
  exp("printer ka cartridge liya 3500 ka", 3500, "Printer cartridge", "Shopping > Electronics"),

  // ── Shopping > Online ────────────────────────────────────────────────
  exp("daraz se order kiya 2200 ka", 2200, "Daraz order", "Shopping > Online"),
  exp("online shopping ki amazon se 3500 ki", 3500, "Amazon order", "Shopping > Online"),
  exp("daraz se kapre order kiye 1800 ke", 1800, "Daraz order", "Shopping > Online"),
  exp("online mobile accessories li 900 ki", 900, "Online order", "Shopping > Online"),
  exp("daraz pe order kiya 4000 ka sale mein", 4000, "Daraz order", "Shopping > Online"),
  exp("online books order ki 1200 ki", 1200, "Online books", "Shopping > Online"),
  exp("temu se order kiya 700 ka", 700, "Online order", "Shopping > Online"),

  // ── Shopping > Shoes ─────────────────────────────────────────────────
  exp("joote liye 3500 ke", 3500, "Joote", "Shopping > Shoes"),
  exp("sneakers khareede 5000 ke", 5000, "Sneakers", "Shopping > Shoes"),
  exp("sandals li 1500 ki", 1500, "Sandals", "Shopping > Shoes"),
  exp("office ke liye joote liye 4200 ke", 4200, "Joote", "Shopping > Shoes"),
  exp("bacho ke joote liye 1200 ke", 1200, "Bacho ke joote", "Shopping > Shoes"),
  exp("chappal khareedi 600 ki", 600, "Chappal", "Shopping > Shoes"),
  exp("shaadi ke liye joote liye 6000 ke", 6000, "Joote", "Shopping > Shoes"),

  // ── Family > Kids ────────────────────────────────────────────────────
  exp("bachon ke liye 1000 kharch kiye", 1000, "Bachay", "Family > Kids"),
  exp("bacho ka school bag liya 2500 ka", 2500, "School bag", "Family > Kids"),
  exp("bache ke liye toy liya 800 ka", 800, "Toy", "Family > Kids"),
  exp("diaper liye bache ke 1500 ke", 1500, "Diaper", "Family > Kids"),
  exp("bacho ki school van fees di 3000 ki", 3000, "School van", "Family > Kids"),
  exp("bache ka birthday manaya 5000 ka", 5000, "Birthday", "Family > Kids"),
  exp("bacho ke liye stationery li 700 ki", 700, "Stationery", "Family > Kids"),
  exp("bache ke doodh ka saman liya 1200 ka", 1200, "Bache ka saman", "Family > Kids"),

  // ── Family > Parents ─────────────────────────────────────────────────
  exp("walid ko diye 5000", 5000, "Walid", "Family > Parents"),
  exp("ammi abbu ko diye 10000 is mahine", 10000, "Parents", "Family > Parents"),
  exp("walida ke liye dawai li 800 ki", 800, "Walida ki dawai", "Family > Parents"),
  exp("ammi ko kharcha diya 6000", 6000, "Ammi kharcha", "Family > Parents"),
  exp("abbu ko diye ghar ke kharche ke 15000", 15000, "Abbu", "Family > Parents"),
  exp("parents ko diye 8000", 8000, "Parents", "Family > Parents"),

  // ── Family > Gifts ───────────────────────────────────────────────────
  exp("tohfa liya 1500 ka", 1500, "Tohfa", "Family > Gifts"),
  exp("salgira gift liya 2000 ka", 2000, "Salgira gift", "Family > Gifts"),
  exp("dost ki shaadi ka gift liya 3000 ka", 3000, "Gift", "Family > Gifts"),
  exp("wife ke liye gift liya 5000 ka", 5000, "Gift", "Family > Gifts"),
  exp("bache ke liye gift liya 1200 ka", 1200, "Gift", "Family > Gifts"),
  exp("eidi diye bacho ko 3000", 3000, "Eidi", "Family > Gifts"),
  exp("anniversary gift liya 4000 ka", 4000, "Gift", "Family > Gifts"),

  // ── Family > Shaadi/Events ───────────────────────────────────────────
  exp("shaadi mein diye 10000", 10000, "Shaadi", "Family > Shaadi/Events"),
  exp("mehndi ke liye kharch kiya 8000", 8000, "Mehndi", "Family > Shaadi/Events"),
  exp("walima mein card diya 15000 ka", 15000, "Walima", "Family > Shaadi/Events"),
  exp("function mein kharch howay 5000", 5000, "Function", "Family > Shaadi/Events"),
  exp("shaadi ka card diya 20000 ka", 20000, "Shaadi card", "Family > Shaadi/Events"),
  exp("baraat ka intezam kiya 12000 ka", 12000, "Baraat", "Family > Shaadi/Events"),
  exp("aqeeqa function mein 7000 kharch howay", 7000, "Aqeeqa", "Family > Shaadi/Events"),

  // ── Education > Fees ─────────────────────────────────────────────────
  exp("university ki fees 45000 di", 45000, "Fees", "Education > Fees"),
  exp("school fees di 8000", 8000, "School fees", "Education > Fees"),
  exp("tuition fees diye 3000", 3000, "Tuition fees", "Education > Fees"),
  exp("bache ki school fees jama karwai 6000 ki", 6000, "School fees", "Education > Fees"),
  exp("college ki fees 12000 di", 12000, "College fees", "Education > Fees"),
  exp("admission fees diye 25000", 25000, "Admission fees", "Education > Fees"),
  exp("exam fees jama karwai 2000 ki", 2000, "Exam fees", "Education > Fees"),
  exp("semester fees diya 55000", 55000, "Semester fees", "Education > Fees"),
  exp("madrasa fees di 1500", 1500, "Madrasa fees", "Education > Fees"),

  // ── Education > Books ────────────────────────────────────────────────
  exp("kitab li 500 ki", 500, "Kitab", "Education > Books"),
  exp("notebook liye 400 ke", 400, "Notebook", "Education > Books"),
  exp("stationery li 600 ki", 600, "Stationery", "Education > Books"),
  exp("bache ki kitabein li 2500 ki", 2500, "Kitabein", "Education > Books"),
  exp("copies aur pencil liye 350 ke", 350, "Stationery", "Education > Books"),
  exp("course ki kitab li 1200 ki", 1200, "Course kitab", "Education > Books"),
  exp("syllabus books liye 3000 ke", 3000, "Books", "Education > Books"),

  // ── Education > Courses ──────────────────────────────────────────────
  exp("online course liya 5000 ka", 5000, "Online course", "Education > Courses"),
  exp("coaching join ki 4000 ki fees se", 4000, "Coaching", "Education > Courses"),
  exp("workshop attend kiya 2500 ka", 2500, "Workshop", "Education > Courses"),
  exp("english course join kiya 3500 ka", 3500, "English course", "Education > Courses"),
  exp("coding course liya 8000 ka", 8000, "Coding course", "Education > Courses"),
  exp("bache ki tuition academy fees 6000 di", 6000, "Academy fees", "Education > Courses"),

  // ── Charity > Sadqa ──────────────────────────────────────────────────
  exp("sadqa diya 500", 500, "Sadqa", "Charity > Sadqa"),
  exp("sadqa kiya 1000 ka faqeer ko", 1000, "Sadqa", "Charity > Sadqa"),
  exp("gareeb ko sadqa diya 300", 300, "Sadqa", "Charity > Sadqa"),
  exp("juma ke din sadqa diya 200", 200, "Sadqa", "Charity > Sadqa"),
  exp("sadqa kiya musafir ko 400", 400, "Sadqa", "Charity > Sadqa"),
  exp("khairat diya 600", 600, "Khairat", "Charity > Sadqa"),
  exp("langar mein diye 1500", 1500, "Langar", "Charity > Sadqa"),

  // ── Charity > Zakat ──────────────────────────────────────────────────
  exp("zakat diya 15000 madrasa ko", 15000, "Zakat", "Charity > Zakat"),
  exp("zakat nikali 20000 gareebon ko", 20000, "Zakat", "Charity > Zakat"),
  exp("zakat ke paise diye 10000", 10000, "Zakat", "Charity > Zakat"),
  exp("orphanage ko zakat diya 8000", 8000, "Zakat", "Charity > Zakat"),
  exp("saal ki zakat 30000 ki", 30000, "Zakat", "Charity > Zakat"),
  exp("zakat diya masjid ko 5000", 5000, "Zakat", "Charity > Zakat"),

  // ── Personal > Salon ─────────────────────────────────────────────────
  exp("salon pe 1200 lag gaye", 1200, "Salon", "Personal > Salon"),
  exp("haircut karwaya 500 ka", 500, "Haircut", "Personal > Salon"),
  exp("barber ko diye 300", 300, "Barber", "Personal > Salon"),
  exp("facial karwaya 2000 ka", 2000, "Facial", "Personal > Salon"),
  exp("saloon mein 1800 kharch howay", 1800, "Salon", "Personal > Salon"),
  exp("shaadi se pehle salon gaya 3500 ka", 3500, "Salon", "Personal > Salon"),
  exp("beard trim karwai 200 ki", 200, "Beard trim", "Personal > Salon"),

  // ── Personal > Subscriptions ─────────────────────────────────────────
  exp("netflix subscription 950", 950, "Netflix", "Personal > Subscriptions"),
  exp("youtube premium liya 400 ka", 400, "YouTube Premium", "Personal > Subscriptions"),
  exp("spotify subscription 300 ki", 300, "Spotify", "Personal > Subscriptions"),
  exp("netflix ka bill kata 1200", 1200, "Netflix", "Personal > Subscriptions"),
  exp("icloud storage liya 350 ka", 350, "iCloud storage", "Personal > Subscriptions"),
  exp("amazon prime liya 600 ka", 600, "Amazon Prime", "Personal > Subscriptions"),
  exp("chatgpt subscription li 2000 ki", 2000, "ChatGPT subscription", "Personal > Subscriptions"),

  // ── Personal > Entertainment ─────────────────────────────────────────
  exp("movie dekhi cinema mein 1500 ki", 1500, "Movie", "Personal > Entertainment"),
  exp("dost ke sath outing ki 3000 ki", 3000, "Outing", "Personal > Entertainment"),
  exp("cinema ticket liya 800 ka", 800, "Cinema ticket", "Personal > Entertainment"),
  exp("game khareeda 2500 ka", 2500, "Game", "Personal > Entertainment"),
  exp("family ke sath park gaya 1200 kharch howay", 1200, "Park outing", "Personal > Entertainment"),
  exp("concert ka ticket liya 5000 ka", 5000, "Concert ticket", "Personal > Entertainment"),

  // ── Personal > Travel ────────────────────────────────────────────────
  exp("trip pe gaya 15000 kharch howay", 15000, "Trip", "Personal > Travel"),
  exp("flight ticket liya 25000 ka", 25000, "Flight ticket", "Personal > Travel"),
  exp("hotel booking ki 8000 ki", 8000, "Hotel booking", "Personal > Travel"),
  exp("northern areas trip pe 30000 kharch howay", 30000, "Trip", "Personal > Travel"),
  exp("bus ticket liya lahore ka 2000 ka", 2000, "Bus ticket", "Personal > Travel"),
  exp("resort mein stay kiya 12000 ka", 12000, "Resort stay", "Personal > Travel"),

  // ── Income ───────────────────────────────────────────────────────────
  inc("salary mil gayi 150000", 150000, "Income > Salary"),
  inc("is mahine salary 120000 mili", 120000, "Income > Salary"),
  inc("tankhwah mil gayi 95000", 95000, "Income > Salary"),
  inc("salary account mein aa gayi 200000", 200000, "Income > Salary"),
  inc("freelance se 25000 aaye", 25000, "Income > Freelance"),
  inc("freelance project ka payment mila 40000", 40000, "Income > Freelance"),
  inc("upwork se payment mila 60000", 60000, "Income > Freelance"),
  inc("client se payment aya 35000", 35000, "Income > Freelance"),
  inc("bonus mila 10000 ka", 10000, "Income > Bonus"),
  inc("eid bonus mila 15000", 15000, "Income > Bonus"),
  inc("performance bonus mila 20000", 20000, "Income > Bonus"),
  inc("dividend mila stocks se 8000", 8000, "Income > Dividend"),
  inc("PSX se dividend aya 12000", 12000, "Income > Dividend"),
  inc("stock ka dividend mila 5000", 5000, "Income > Dividend"),
  inc("kiraya mila tenant se 30000", 30000, "Income > Rental"),
  inc("makan ka rent mila 25000", 25000, "Income > Rental"),
  inc("shop ka kiraya mila 15000", 15000, "Income > Rental"),
  inc("eidi mili 5000", 5000, "Income > Gift"),
  inc("gift mila cash mein 3000", 3000, "Income > Gift"),
];

const LOAN_TRANSFER_ACCOUNT_EXAMPLES: SeedExample[] = [
  // ── Loans given ──────────────────────────────────────────────────────
  { raw_text: "Bilal ko 5000 udhaar diye", expected: { intent: "lend_money", amount: 5000, person: "Bilal" } },
  { raw_text: "Ahmed ko 3000 diye udhaar", expected: { intent: "lend_money", amount: 3000, person: "Ahmed" } },
  { raw_text: "dost ko 1000 diye udhaar", expected: { intent: "lend_money", amount: 1000, person: "dost" } },
  { raw_text: "Hassan ko 2000 udhaar de diye", expected: { intent: "lend_money", amount: 2000, person: "Hassan" } },
  { raw_text: "chacha ko 10000 udhaar diye", expected: { intent: "lend_money", amount: 10000, person: "chacha" } },
  { raw_text: "colleague ko qarz diya 4000", expected: { intent: "lend_money", amount: 4000, person: "colleague" } },
  { raw_text: "Ali ko 1500 diye wo wapas kar dega", expected: { intent: "lend_money", amount: 1500, person: "Ali" } },
  { raw_text: "neighbour ko 2500 udhaar diye", expected: { intent: "lend_money", amount: 2500, person: "neighbour" } },
  { raw_text: "Bilal ko phir se 2000 diye", expected: { intent: "lend_money", amount: 2000, person: "Bilal" } },
  { raw_text: "cousin ko 6000 udhaar diye shaadi ke liye", expected: { intent: "lend_money", amount: 6000, person: "cousin" } },

  // ── Loans taken ──────────────────────────────────────────────────────
  { raw_text: "Ahmed se 2000 udhaar liye", expected: { intent: "borrow_money", amount: 2000, person: "Ahmed" } },
  { raw_text: "Bilal se 5000 liye qarz", expected: { intent: "borrow_money", amount: 5000, person: "Bilal" } },
  { raw_text: "dost se 3000 udhaar liye", expected: { intent: "borrow_money", amount: 3000, person: "dost" } },
  { raw_text: "brother se 8000 liye", expected: { intent: "borrow_money", amount: 8000, person: "brother" } },
  { raw_text: "office colleague se 1000 udhaar liye", expected: { intent: "borrow_money", amount: 1000, person: "colleague" } },
  { raw_text: "Hassan se 4000 liye emergency ke liye", expected: { intent: "borrow_money", amount: 4000, person: "Hassan" } },
  { raw_text: "phupo se 15000 udhaar liye", expected: { intent: "borrow_money", amount: 15000, person: "phupo" } },
  { raw_text: "Ali se 2000 liye kal", expected: { intent: "borrow_money", amount: 2000, person: "Ali" } },

  // ── Repayment phrasing (still lend/borrow intent — resolveLoan decides) ─
  { raw_text: "Bilal ne 2000 wapas kiye", expected: { intent: "lend_money", amount: 2000, person: "Bilal" } },
  { raw_text: "Ahmed ko wapas diye 1000 udhaar ke", expected: { intent: "borrow_money", amount: 1000, person: "Ahmed" } },
  { raw_text: "dost ne udhaar wapas kiya 3000", expected: { intent: "lend_money", amount: 3000, person: "dost" } },
  { raw_text: "Hassan ko qarz wapas kiya 2500", expected: { intent: "borrow_money", amount: 2500, person: "Hassan" } },

  // ── Declare account ──────────────────────────────────────────────────
  { raw_text: "mere Meezan bank account mein 78000 pari hai", expected: { intent: "declare_account", amount: 78000, account: "Meezan" } },
  { raw_text: "cash mein 5000 hain abhi", expected: { intent: "declare_account", amount: 5000, account: "Cash" } },
  { raw_text: "jazzcash mein 2000 pare hain", expected: { intent: "declare_account", amount: 2000, account: "JazzCash" } },
  { raw_text: "HBL account mein 45000 hain", expected: { intent: "declare_account", amount: 45000, account: "HBL" } },
  { raw_text: "easypaisa mein 3000 pare hain", expected: { intent: "declare_account", amount: 3000, account: "Easypaisa" } },
  { raw_text: "UBL bank mein 120000 hain mere", expected: { intent: "declare_account", amount: 120000, account: "UBL" } },
  { raw_text: "sadapay wallet mein 1500 hain", expected: { intent: "declare_account", amount: 1500, account: "SadaPay" } },
  { raw_text: "allied bank account mein 60000 pare hain", expected: { intent: "declare_account", amount: 60000, account: "Allied" } },
  { raw_text: "nayapay mein 800 hain abhi", expected: { intent: "declare_account", amount: 800, account: "NayaPay" } },
  { raw_text: "cash mein abhi 12000 hain ghar pe", expected: { intent: "declare_account", amount: 12000, account: "Cash" } },
  { raw_text: "Meezan mein balance 78000 se 82000 ho gaya hai", expected: { intent: "declare_account", amount: 82000, account: "Meezan" } },

  // ── Transfer ─────────────────────────────────────────────────────────
  { raw_text: "Meezan se cash mein 5000 nikale", expected: { intent: "transfer", amount: 5000, account: "Meezan" } },
  { raw_text: "HBL se jazzcash mein 3000 bheje", expected: { intent: "transfer", amount: 3000, account: "HBL" } },
  { raw_text: "cash se Meezan mein 10000 jama karwaye", expected: { intent: "transfer", amount: 10000, account: "Cash" } },
  { raw_text: "UBL se easypaisa mein 2000 transfer kiye", expected: { intent: "transfer", amount: 2000, account: "UBL" } },
  { raw_text: "Meezan se HBL mein 15000 bheje", expected: { intent: "transfer", amount: 15000, account: "Meezan" } },
  { raw_text: "jazzcash se cash mein 1500 nikale", expected: { intent: "transfer", amount: 1500, account: "JazzCash" } },
  { raw_text: "allied se meezan mein 8000 bheje", expected: { intent: "transfer", amount: 8000, account: "Allied" } },
];

async function main() {
  await ensureIndexes();
  const db = await getDb();
  const col = db.collection("examples");

  const all = [...EXAMPLES, ...LOAN_TRANSFER_ACCOUNT_EXAMPLES];
  const docs = all.map((e) => ({
    _id: new ObjectId(),
    user_id: null, // global corpus — plan.md §2.2
    raw_text: e.raw_text,
    expected: e.expected,
    source: "seed" as const,
    hit_count: 0,
    created_at: new Date(),
  }));

  // Replace the global seed corpus rather than appending to it. Plain
  // insertMany deduplicated nothing, so re-running duplicated all ~560 rows —
  // and worse, a seed example that was CORRECTED in this file stayed in the DB
  // teaching the old mapping forever (that is exactly how "flat ka kiraya"
  // kept resolving to Home > Rent). Scoped to user_id:null + source:"seed", so
  // user corrections and verified examples are never touched.
  const removed = await col.deleteMany({ user_id: null, source: "seed" });
  const result = await col.insertMany(docs);

  if (removed.deletedCount > 0) {
    console.log(`  Replaced ${removed.deletedCount} previous seed examples.`);
  }
  console.log(`✓ Seeded ${result.insertedCount} example phrases (global corpus).`);
  console.log("  User corrections (source:\"correction\"/\"verified\") left untouched.");
  console.log("  Extend EXAMPLES / LOAN_TRANSFER_ACCOUNT_EXAMPLES and re-run to refresh.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});

import numpy as np
import pandas as pd
import requests
import matplotlib.pyplot as plt
from statsmodels.formula.api import ols


OECD_ISO3 = [
    "AUS","AUT","BEL","CAN","CHL","COL","CRI","CZE","DNK","EST","FIN","FRA",
    "DEU","GRC","HUN","ISL","IRL","ISR","ITA","JPN","KOR","LVA","LTU","LUX",
    "MEX","NLD","NZL","NOR","POL","PRT","SVK","SVN","ESP","SWE","CHE","TUR",
    "GBR","USA"
]

WB_INDICATORS = {
    "suicide_male": "SH.STA.SUIC.MA.P5",
    "suicide_female": "SH.STA.SUIC.FE.P5",
    "le_male": "SP.DYN.LE00.MA.IN",
    "le_female": "SP.DYN.LE00.FE.IN",
    "unemployment": "SL.UEM.TOTL.ZS",
    "alcohol_lpc": "SH.ALC.PCAP.LI",
    "urban_pct": "SP.URB.TOTL.IN.ZS",
    "gdp_pc": "NY.GDP.PCAP.KD",
}


def wb_fetch(indicator, countries, start=2000, end=2024):
    country_str = ";".join(countries)
    url = (
        "https://api.worldbank.org/v2/country/"
        f"{country_str}/indicator/{indicator}"
        f"?format=json&per_page=20000&date={start}:{end}"
    )
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    if not data or len(data) < 2:
        return pd.DataFrame()
    rows = []
    for rec in data[1]:
        rows.append(
            {
                "iso3": rec["countryiso3code"],
                "country": rec["country"]["value"],
                "year": int(rec["date"]),
                indicator: rec["value"],
            }
        )
    return pd.DataFrame(rows)


def load_wb_panel():
    frames = []
    for name, code in WB_INDICATORS.items():
        df = wb_fetch(code, OECD_ISO3)
        if df.empty:
            print("Missing WB indicator:", name)
            continue
        df = df.rename(columns={code: name})
        frames.append(df)
    panel = frames[0]
    for df in frames[1:]:
        panel = panel.merge(df, on=["iso3", "country", "year"], how="outer")
    panel["suicide_ratio_mf"] = panel["suicide_male"] / panel["suicide_female"]
    panel["le_gap_fm"] = panel["le_female"] - panel["le_male"]
    panel["log_gdp_pc"] = np.log(panel["gdp_pc"])
    return panel


def load_oecd_paternity_usage():
    url = "https://webfs.oecd.org/els-com/Family_Database/PF2-2-Use-childbirth-leave.xlsx"
    df = pd.read_excel(url, sheet_name="Paternity_leave", usecols="A:W", nrows=500)
    hdr_idx = df.index[df.iloc[:, 0] == "Country"][0]
    header = df.iloc[hdr_idx].tolist()
    data = df.iloc[hdr_idx + 1 :].copy()
    data.columns = header
    data = data.dropna(subset=["Country"])
    cols = list(data.columns)
    cols[1] = "Gender"
    cols[2] = "Note"
    data.columns = cols
    years = [c for c in data.columns if isinstance(c, (int, float))]
    long = data.melt(
        id_vars=["Country"], value_vars=years, var_name="year", value_name="paternity_users"
    )
    long = long[long["year"].notna()]
    long["paternity_users"] = pd.to_numeric(long["paternity_users"], errors="coerce")
    long = long.rename(columns={"Country": "country"})
    long["year"] = long["year"].astype(int)
    return long


def build_panel():
    panel = load_wb_panel()
    paternity = load_oecd_paternity_usage()
    name_to_iso = (
        panel[["country", "iso3"]].dropna().drop_duplicates().set_index("country")["iso3"].to_dict()
    )
    paternity["iso3"] = paternity["country"].map(name_to_iso)
    panel = panel.merge(paternity[["iso3", "year", "paternity_users"]], on=["iso3", "year"], how="left")
    panel = panel.dropna(subset=["paternity_users"])
    return panel


def run_models(panel):
    models = {
        "suicide_male": "suicide_male",
        "suicide_ratio_mf": "suicide_ratio_mf",
        "le_gap_fm": "le_gap_fm",
    }
    results = {}
    for key, y in models.items():
        df = panel.dropna(
            subset=[y, "unemployment", "alcohol_lpc", "urban_pct", "log_gdp_pc"]
        )
        formula = (
            f"{y} ~ paternity_users + unemployment + alcohol_lpc + urban_pct + log_gdp_pc "
            "+ C(iso3) + C(year)"
        )
        model = ols(formula, data=df).fit(
            cov_type="cluster", cov_kwds={"groups": df["iso3"]}
        )
        results[key] = (model, df)
    return results


def run_lag_models(panel, lags=(1, 2, 3)):
    models = {
        "suicide_male": "suicide_male",
        "suicide_ratio_mf": "suicide_ratio_mf",
        "le_gap_fm": "le_gap_fm",
    }
    lag_results = {}
    panel = panel.sort_values(["iso3", "year"]).copy()
    for lag in lags:
        panel[f"paternity_lag{lag}"] = panel.groupby("iso3")["paternity_users"].shift(lag)
        for key, y in models.items():
            df = panel.dropna(
                subset=[y, f"paternity_lag{lag}", "unemployment", "alcohol_lpc", "urban_pct", "log_gdp_pc"]
            )
            formula = (
                f"{y} ~ paternity_lag{lag} + unemployment + alcohol_lpc + urban_pct + log_gdp_pc "
                "+ C(iso3) + C(year)"
            )
            model = ols(formula, data=df).fit(
                cov_type="cluster", cov_kwds={"groups": df["iso3"]}
            )
            lag_results[(key, lag)] = (model, df)
    return lag_results


def run_min_controls(panel):
    models = {
        "suicide_male": "suicide_male",
        "suicide_ratio_mf": "suicide_ratio_mf",
        "le_gap_fm": "le_gap_fm",
    }
    results = {}
    for key, y in models.items():
        df = panel.dropna(subset=[y, "unemployment", "log_gdp_pc"])
        formula = f"{y} ~ paternity_users + unemployment + log_gdp_pc + C(iso3) + C(year)"
        model = ols(formula, data=df).fit(
            cov_type="cluster", cov_kwds={"groups": df["iso3"]}
        )
        results[key] = (model, df)
    return results


def main():
    panel = build_panel()
    panel_results = []
    print("Panel rows:", len(panel))
    print("Countries:", panel["iso3"].nunique())
    print("Years:", panel["year"].min(), panel["year"].max())
    print("Correlation (pairwise):")
    print(panel[["paternity_users", "suicide_male", "le_gap_fm"]].corr())
    results = run_models(panel)
    for name, (model, df) in results.items():
        print("\nMODEL:", name)
        print("N:", int(model.nobs), "countries:", df["iso3"].nunique())
        print(model.params[["paternity_users"]])
        print(model.pvalues[["paternity_users"]])
        panel_results.append(
            {
                "model": "base",
                "outcome": name,
                "coef": float(model.params["paternity_users"]),
                "pvalue": float(model.pvalues["paternity_users"]),
                "n": int(model.nobs),
                "countries": int(df["iso3"].nunique()),
            }
        )

    lag_results = run_lag_models(panel)
    for (name, lag), (model, df) in lag_results.items():
        print(f"\nMODEL: {name} (lag {lag})")
        print("N:", int(model.nobs), "countries:", df["iso3"].nunique())
        print(model.params[[f"paternity_lag{lag}"]])
        print(model.pvalues[[f"paternity_lag{lag}"]])
        panel_results.append(
            {
                "model": f"lag{lag}",
                "outcome": name,
                "coef": float(model.params[f"paternity_lag{lag}"]),
                "pvalue": float(model.pvalues[f"paternity_lag{lag}"]),
                "n": int(model.nobs),
                "countries": int(df["iso3"].nunique()),
            }
        )

    min_results = run_min_controls(panel)
    for name, (model, df) in min_results.items():
        print(f"\nMODEL: {name} (min controls)")
        print("N:", int(model.nobs), "countries:", df["iso3"].nunique())
        print(model.params[["paternity_users"]])
        print(model.pvalues[["paternity_users"]])
        panel_results.append(
            {
                "model": "min_controls",
                "outcome": name,
                "coef": float(model.params["paternity_users"]),
                "pvalue": float(model.pvalues["paternity_users"]),
                "n": int(model.nobs),
                "countries": int(df["iso3"].nunique()),
            }
        )

    pd.DataFrame(panel_results).to_csv(
        "c:\\Users\\bogum\\OneDrive\\Desktop\\boy burger\\panel_results.csv", index=False
    )

    # Cross-section (best overlap year)
    key_cols = ["paternity_users", "suicide_male", "le_gap_fm"]
    year_counts = (
        panel.dropna(subset=key_cols)
        .groupby("year")[key_cols[0]]
        .count()
        .sort_values(ascending=False)
    )
    best_year = int(year_counts.index[0]) if len(year_counts) else None
    if best_year is not None:
        cross = panel[panel["year"] == best_year].copy()
        cross = cross.dropna(subset=key_cols)
        cross.to_csv(
            "c:\\Users\\bogum\\OneDrive\\Desktop\\boy burger\\cross_section_best_year.csv",
            index=False,
        )
        corr = cross[key_cols].corr()
        print(f"\nCross-section {best_year} correlations:")
        print(corr)

        # Simple scatter plots
        fig_dir = "c:\\Users\\bogum\\OneDrive\\Desktop\\boy burger\\figures"
        plt.figure(figsize=(6, 4))
        plt.scatter(cross["paternity_users"], cross["suicide_male"], alpha=0.8)
        z = np.polyfit(cross["paternity_users"], cross["suicide_male"], 1)
        p = np.poly1d(z)
        xs = np.linspace(cross["paternity_users"].min(), cross["paternity_users"].max(), 50)
        plt.plot(xs, p(xs), linestyle="--")
        plt.xlabel("Paternity leave users per 100 births (PF2.2)")
        plt.ylabel("Male suicide rate (WB)")
        plt.title(f"Cross-section {best_year}: paternity usage vs male suicide")
        plt.tight_layout()
        plt.savefig(f"{fig_dir}\\paternity_{best_year}_vs_suicide_male.png", dpi=150)
        plt.close()

        plt.figure(figsize=(6, 4))
        plt.scatter(cross["paternity_users"], cross["le_gap_fm"], alpha=0.8)
        z = np.polyfit(cross["paternity_users"], cross["le_gap_fm"], 1)
        p = np.poly1d(z)
        xs = np.linspace(cross["paternity_users"].min(), cross["paternity_users"].max(), 50)
        plt.plot(xs, p(xs), linestyle="--")
        plt.xlabel("Paternity leave users per 100 births (PF2.2)")
        plt.ylabel("Life expectancy gap (female - male)")
        plt.title(f"Cross-section {best_year}: paternity usage vs LE gap")
        plt.tight_layout()
        plt.savefig(f"{fig_dir}\\paternity_{best_year}_vs_le_gap.png", dpi=150)
        plt.close()
    else:
        print("\nCross-section: no year with sufficient overlap for plots.")


if __name__ == "__main__":
    main()

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from textwrap import indent
from typing import List

import requests
from zeep import Client
from zeep.transports import Transport

API_KEY = "d9d3ee105bf04a23a2e2"
WSDL_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/wsdl/UslugaBIRzewnPubl-ver11-prod.wsdl"


# ========= MODEL DANYCH =========


@dataclass
class Podmiot:
    regon: str
    nip: str
    nazwa: str
    wojewodztwo: str
    powiat: str
    gmina: str
    miejscowosc: str
    kod_pocztowy: str
    ulica: str
    nr_nieruchomosci: str
    nr_lokalu: str | None
    typ: str
    silos_id: int
    data_zakonczenia_dzialalnosci: str | None
    miejscowosc_poczty: str

    def pretty(self) -> str:
        linie = [
            f"Nazwa: {self.nazwa}",
            f"NIP: {self.nip}",
            f"REGON: {self.regon}",
            f"Województwo: {self.wojewodztwo}",
            f"Powiat: {self.powiat}",
            f"Gmina: {self.gmina}",
            f"Miejscowość: {self.miejscowosc}",
            f"Kod pocztowy: {self.kod_pocztowy}",
            f"Ulica: {self.ulica}",
            f"Numer nieruchomości: {self.nr_nieruchomosci}",
            f"Numer lokalu: {self.nr_lokalu or '-'}",
            f"Miejscowość poczty: {self.miejscowosc_poczty}",
            f"Typ: {self.typ}",
            f"SilosID: {self.silos_id}",
        ]
        if self.data_zakonczenia_dzialalnosci:
            linie.append(f"Zakończenie działalności: {self.data_zakonczenia_dzialalnosci}")
        return "\n".join(linie)



def podmiot_from_xml(dane_el: ET.Element) -> Podmiot:
    def get(tag: str) -> str | None:
        el = dane_el.find(tag)
        return (el.text or "").strip() if el is not None and el.text is not None else None

    return Podmiot(
        regon=get("Regon") or "",
        nip=get("Nip") or "",
        nazwa=get("Nazwa") or "",
        wojewodztwo=get("Wojewodztwo") or "",
        powiat=get("Powiat") or "",
        gmina=get("Gmina") or "",
        miejscowosc=get("Miejscowosc") or "",
        kod_pocztowy=get("KodPocztowy") or "",
        ulica=get("Ulica") or "",
        nr_nieruchomosci=get("NrNieruchomosci") or "",
        nr_lokalu=get("NrLokalu"),
        typ=get("Typ") or "",
        silos_id=int(get("SilosID") or 0),
        data_zakonczenia_dzialalnosci=get("DataZakonczeniaDzialalnosci"),
        miejscowosc_poczty=get("MiejscowoscPoczty") or "",
    )


def parse_podmioty(xml_str: str) -> List[Podmiot]:
    root = ET.fromstring(xml_str)
    return [podmiot_from_xml(d) for d in root.findall("dane")]


# ========= KOMUNIKACJA Z BIR =========

def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/xml,application/xml,application/soap+xml;q=0.9,*/*;q=0.8",
    })
    return s


def login(session: requests.Session) -> tuple[str, Client]:
    transport = Transport(session=session)
    client = Client(WSDL_URL, transport=transport)

    sid = client.service.Zaloguj(API_KEY)
    if not sid:
        raise RuntimeError("Brak SID z metody Zaloguj")

    session.headers.update({
        "sid": sid,
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Accept": "application/xml",
    })
    return sid, client


def search_by_nip(nip: str) -> List[Podmiot]:
    # normalizacja NIP -> same cyfry
    nip_digits = "".join(ch for ch in nip if ch.isdigit())
    if len(nip_digits) != 10:
        raise ValueError("NIP musi mieć 10 cyfr (bez kresek).")

    session = make_session()
    sid, client = login(session)

    criteria = {"Nip": nip_digits}
    xml_result = client.service.DaneSzukajPodmioty(criteria)

    if not xml_result or not xml_result.strip():
        # opcjonalnie: tu można jeszcze zaciągnąć KomunikatKod/KomunikatTresc z GetValue
        try:
            client.service.Wyloguj(sid)
        except Exception:
            pass
        return []

    podmioty = parse_podmioty(xml_result)

    try:
        client.service.Wyloguj(sid)
    except Exception:
        pass

    return podmioty


# ========= CLI / wywołanie z Electrona (NIP jako argument → JSON na stdout) =========

if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) >= 2:
        nip_arg = "".join(ch for ch in sys.argv[1] if ch.isdigit())
        if len(nip_arg) == 10:
            try:
                podmioty = search_by_nip(nip_arg)
                if not podmioty:
                    print(json.dumps({"error": "Brak danych dla podanego NIP."}, ensure_ascii=False))
                else:
                    p = podmioty[0]
                    short = p.nazwa if len(p.nazwa) <= 30 else p.nazwa[:27] + "…"
                    out = {
                        "name": p.nazwa,
                        "short_name": short,
                        "nip": p.nip,
                        "street": p.ulica,
                        "building": p.nr_nieruchomosci,
                        "local": p.nr_lokalu or "",
                        "postal_code": p.kod_pocztowy,
                        "city": p.miejscowosc,
                        "country": "Poland",
                        "regon": p.regon or None,
                        "statusVat": "",
                        "contact_person": "",
                    }
                    print(json.dumps(out, ensure_ascii=False))
                    sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"error": str(e)}, ensure_ascii=False))
                sys.stdout.flush()
            sys.exit(0)

    nip_input = input("Podaj NIP (bez kresek): ").strip()
    podmioty = search_by_nip(nip_input)

    if not podmioty:
        print("Brak danych dla podanego NIP.")
    else:
        print("\nZnalezione podmioty:\n")
        for i, p in enumerate(podmioty, start=1):
            print(f"=== Podmiot {i} ===")
            print(indent(p.pretty(), "  "))
            print()

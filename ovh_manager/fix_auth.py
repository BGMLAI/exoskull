import ovh
import json
import webbrowser

# Wczytaj istniejące dane
with open('ovh_credentials.json') as f:
    creds = json.load(f)

print('='*60)
print('NAPRAWA AUTORYZACJI OVH')
print('='*60)
print()

# Spróbuj użyć istniejących danych
client = ovh.Client(
    endpoint='ovh-eu',
    application_key=creds['application_key'],
    application_secret=creds['application_secret']
)

print('1. Request new consumer key with permissions...')

# Pełne uprawnienia
access_rules = [
    {'method': 'GET', 'path': '/*'},
    {'method': 'POST', 'path': '/*'},
    {'method': 'PUT', 'path': '/*'},
    {'method': 'DELETE', 'path': '/*'},
]

try:
    # Request consumer key
    validation = client.request_consumerkey(access_rules)
    
    print()
    print('NOWY CONSUMER KEY:')
    print(validation['consumerKey'])
    print()
    print('URL do walidacji:')
    print(validation['validationUrl'])
    print()
    
    # Zapisz nowy consumer key
    creds['consumer_key'] = validation['consumerKey']
    with open('ovh_credentials.json', 'w') as f:
        json.dump(creds, f, indent=2)
    
    print('Zapisano nowy consumer key do pliku.')
    print()
    
    # Otwórz przeglądarkę
    print('Otwieranie przeglądarki...')
    webbrowser.open(validation['validationUrl'])
    
except Exception as e:
    print(f'ERROR: {e}')
    print()
    print('Application Key lub Secret są nieprawidłowe!')
    print('Musisz utworzyć nową aplikację w panelu OVH.')

import json
import webbrowser

with open('ovh_credentials.json') as f:
    c = json.load(f)

# URL do walidacji
url = 'https://eu.api.ovh.com/auth/?credentialToken=' + c['consumer_key']

print('='*50)
print('WALIDACJA OVH API')
print('='*50)
print()
print('Otworz ten link w przegladarce:')
print(url)
print()
print('Lub kliknij Enter aby otworzyc automatycznie...')
input()

webbrowser.open(url)
print('Przegladarka otwarta. Zaloguj sie i zaakceptuj dostep.')

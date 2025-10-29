exemplo .env :

# URLs
URL_ALVO=https://
BASE_URL=https://
EXPECTED_PATH=/app/paginainicial

# Login
LOGIN_USERNAME=bruno.gomes
LOGIN_PASSWORD=a123456
LOGIN_ID_VERIFICACAO=40
LOGIN_ID_SISTEMA=11
LOGIN_ID_CONTRATO=7
LOGIN_NOME_SISTEMA=
LOGIN_CONTRATO_NOME=

# Seletores de login
LOGIN_SELECTOR_USERNAME=#email
LOGIN_SELECTOR_PASSWORD=#password
LOGIN_SELECTOR_SUBMIT=button:contains('Entrar')

# Paleta de cores permitidas (separada por vírgula ou espaço)
PALETA_CORES_PERMITIDAS=#ffffff,#000000,#f8f9fa,#1e293b,#1f3f6e

# Screenshots
ENABLE_SCREENSHOTS=true

# Tokens adicionais a serem pesquisados junto com "null" e "NaN"
# Separe por vírgula ou por nova linha. Ex: SEARCH_TEXTS=erro,indefinido
SEARCH_TEXTS=Infrações

# Puppeteer/Execução
HEADLESS=true
SLOWMO=50
MAXIMIZE=true
VIEWPORT_WIDTH=1920
VIEWPORT_HEIGHT=1080

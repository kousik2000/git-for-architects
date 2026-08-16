from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('cad/convert/', views.convert_dwg, name='convert_dwg'),
]

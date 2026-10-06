include_guard(GLOBAL)

if(BUILD_TESTING AND NOT MODULE_MOD-CHAR-WIDGET STREQUAL "disabled")
  set_property(GLOBAL APPEND PROPERTY ACORE_MODULE_TEST_SOURCES
    "${CMAKE_CURRENT_LIST_DIR}/tests/CharWidgetStateTest.cpp"
    "${CMAKE_CURRENT_LIST_DIR}/tests/CharWidgetMetadataTest.cpp"
    "${CMAKE_CURRENT_LIST_DIR}/tests/CharWidgetHttpTest.cpp")
  set_property(GLOBAL APPEND PROPERTY ACORE_MODULE_TEST_INCLUDES
    "${CMAKE_CURRENT_LIST_DIR}/src")
  if(MODULE_MOD-CHAR-WIDGET STREQUAL "dynamic")
    set_property(GLOBAL APPEND PROPERTY ACORE_MODULE_TEST_SOURCES
      "${CMAKE_CURRENT_LIST_DIR}/src/CharWidgetState.cpp"
      "${CMAKE_CURRENT_LIST_DIR}/src/CharWidgetMetadata.cpp"
      "${CMAKE_CURRENT_LIST_DIR}/src/CharWidgetHttp.cpp")
  endif()
endif()
